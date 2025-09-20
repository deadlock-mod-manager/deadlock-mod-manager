import {
  type CachedVPKWithMod,
  db,
  VpkRepository,
} from "@deadlock-mods/database";
import { type VpkParsed, VpkParser } from "@deadlock-mods/vpk-parser";

type MatchType =
  | "sha256"
  | "contentSignature"
  | "fastHashAndSize"
  | "merkleRoot";

type ModMatchResult = {
  vpkEntry: CachedVPKWithMod;
  certainty: number;
  matchType: MatchType;
  alternativeMatches?: CachedVPKWithMod[];
};

type VpkAnalysisResult = {
  vpk: VpkParsed;
  matchedVpk?: CachedVPKWithMod;
  match?: {
    certainty: number;
    matchType: MatchType;
    alternativeMatches?: CachedVPKWithMod[];
  };
};

type HashAnalysisResult = {
  matchedVpk: CachedVPKWithMod;
  match: {
    certainty: number;
    matchType: MatchType;
    alternativeMatches?: CachedVPKWithMod[];
  };
};

export class ModAnalyser {
  private static _instance: ModAnalyser | null = null;
  protected vpkRepository: VpkRepository;
  private constructor() {
    this.vpkRepository = new VpkRepository(db);
  }

  static get instance(): ModAnalyser {
    if (!ModAnalyser._instance) {
      ModAnalyser._instance = new ModAnalyser();
    }
    return ModAnalyser._instance;
  }

  async getModInfo(parsedVpk: VpkParsed): Promise<ModMatchResult | null> {
    const fingerprint = parsedVpk.fingerprint;

    const sha256Match = await this.vpkRepository.findBySha256(
      fingerprint.sha256,
    );
    if (sha256Match) {
      return {
        vpkEntry: sha256Match,
        certainty: 100,
        matchType: "sha256",
      };
    }

    const contentSigMatches = await this.vpkRepository.findByContentSignature(
      fingerprint.contentSignature,
    );
    if (contentSigMatches.length > 0) {
      // If multiple matches, prefer the one with the closest file count
      const bestContentMatch = contentSigMatches.reduce((best, current) => {
        const bestDiff = Math.abs(best.fileCount - fingerprint.fileCount);
        const currentDiff = Math.abs(current.fileCount - fingerprint.fileCount);
        return currentDiff < bestDiff ? current : best;
      });

      return {
        vpkEntry: bestContentMatch,
        certainty: 90,
        matchType: "contentSignature",
        alternativeMatches: contentSigMatches.filter(
          (m) => m.id !== bestContentMatch.id,
        ),
      };
    }

    // 3. Fast hash + size match (70% certainty - quick duplicate detection)
    const fastHashMatches = await this.vpkRepository.findByFastHashAndSize(
      fingerprint.fastHash,
      fingerprint.fileSize,
    );
    if (fastHashMatches.length > 0) {
      // If multiple matches, prefer the one with matching VPK version and file count
      const bestFastMatch = fastHashMatches.reduce((best, current) => {
        const bestScore = this.calculateMatchScore(best, fingerprint);
        const currentScore = this.calculateMatchScore(current, fingerprint);
        return currentScore > bestScore ? current : best;
      });

      return {
        vpkEntry: bestFastMatch,
        certainty: 70,
        matchType: "fastHashAndSize",
        alternativeMatches: fastHashMatches.filter(
          (m) => m.id !== bestFastMatch.id,
        ),
      };
    }

    // 4. Merkle root match (40% certainty - partial content similarity)
    // Only if merkle data is available
    if (fingerprint.merkleRoot) {
      const merkleMatches = await this.vpkRepository.findByMerkleRoot(
        fingerprint.merkleRoot,
      );
      if (merkleMatches.length > 0) {
        // Filter out exact matches we might have already found
        const uniqueMerkleMatches = merkleMatches.filter(
          (match) =>
            match.sha256 !== fingerprint.sha256 &&
            match.contentSig !== fingerprint.contentSignature,
        );

        if (uniqueMerkleMatches.length > 0) {
          // Use the same scoring system but with lower base certainty
          const bestMerkleMatch = uniqueMerkleMatches.reduce(
            (best, current) => {
              const bestScore = this.calculateMatchScore(best, fingerprint);
              const currentScore = this.calculateMatchScore(
                current,
                fingerprint,
              );
              return currentScore > bestScore ? current : best;
            },
          );

          return {
            vpkEntry: bestMerkleMatch,
            certainty: 40,
            matchType: "merkleRoot",
            alternativeMatches: uniqueMerkleMatches.filter(
              (m) => m.id !== bestMerkleMatch.id,
            ),
          };
        }
      }
    }

    return null;
  }

  private calculateMatchScore(
    vpkEntry: CachedVPKWithMod,
    fingerprint: VpkParsed["fingerprint"],
  ): number {
    let score = 0;

    if (vpkEntry.vpkVersion === fingerprint.vpkVersion) {
      score += 30;
    }

    const fileCountDiff = Math.abs(vpkEntry.fileCount - fingerprint.fileCount);
    if (fileCountDiff === 0) {
      score += 40;
    } else if (fileCountDiff <= 5) {
      score += 30;
    } else if (fileCountDiff <= 20) {
      score += 15;
    }

    if (vpkEntry.hasMultiparts === fingerprint.hasMultiparts) {
      score += 15;
    }

    if (vpkEntry.hasInlineData === fingerprint.hasInlineData) {
      score += 15;
    }

    return score;
  }

  async analyseVPK(file: Buffer): Promise<VpkAnalysisResult> {
    const parsed = VpkParser.parse(file, {
      includeFullFileHash: true,
      includeMerkle: true,
    });

    const modInfo = await this.getModInfo(parsed);

    if (modInfo) {
      return {
        vpk: parsed,
        matchedVpk: modInfo.vpkEntry,
        match: {
          certainty: modInfo.certainty,
          matchType: modInfo.matchType,
          alternativeMatches: modInfo.alternativeMatches,
        },
      };
    }

    return { vpk: parsed };
  }

  async analyseHashes(hashes: {
    sha256?: string;
    contentSignature: string;
    fastHash?: string;
    fileSize?: number;
    merkleRoot?: string;
  }): Promise<HashAnalysisResult[]> {
    const results: HashAnalysisResult[] = [];

    // 1. SHA256 match (100% certainty - exact match)
    if (hashes.sha256) {
      const sha256Match = await this.vpkRepository.findBySha256(hashes.sha256);
      if (sha256Match) {
        results.push({
          matchedVpk: sha256Match,
          match: {
            certainty: 100,
            matchType: "sha256",
          },
        });
        // For SHA256 matches, we can return early as it's definitive
        return results;
      }
    }

    // 2. Content signature match (90% certainty - content-based match)
    const contentSigMatches = await this.vpkRepository.findByContentSignature(
      hashes.contentSignature,
    );
    if (contentSigMatches.length > 0) {
      // If multiple matches, prefer the one with the closest file count (if available)
      let bestContentMatch = contentSigMatches[0];
      let alternativeMatches = contentSigMatches.slice(1);

      if (hashes.fileSize !== undefined) {
        bestContentMatch = contentSigMatches.reduce((best, current) => {
          const bestDiff = Math.abs(best.fileCount - (hashes.fileSize || 0));
          const currentDiff = Math.abs(
            current.fileCount - (hashes.fileSize || 0),
          );
          return currentDiff < bestDiff ? current : best;
        });
        alternativeMatches = contentSigMatches.filter(
          (m) => m.id !== bestContentMatch.id,
        );
      }

      results.push({
        matchedVpk: bestContentMatch,
        match: {
          certainty: 90,
          matchType: "contentSignature",
          alternativeMatches:
            alternativeMatches.length > 0 ? alternativeMatches : undefined,
        },
      });
    }

    // 3. Fast hash + size match (70% certainty - quick duplicate detection)
    if (hashes.fastHash && hashes.fileSize !== undefined) {
      const fastHashMatches = await this.vpkRepository.findByFastHashAndSize(
        hashes.fastHash,
        hashes.fileSize,
      );
      if (fastHashMatches.length > 0) {
        // Filter out matches we already found
        const uniqueFastMatches = fastHashMatches.filter(
          (match) =>
            !results.some((result) => result.matchedVpk.id === match.id),
        );

        if (uniqueFastMatches.length > 0) {
          // If multiple matches, use scoring system (simplified since we don't have full fingerprint)
          const bestFastMatch = uniqueFastMatches.reduce((best, current) => {
            const bestScore = this.calculateHashMatchScore(best, hashes);
            const currentScore = this.calculateHashMatchScore(current, hashes);
            return currentScore > bestScore ? current : best;
          });

          results.push({
            matchedVpk: bestFastMatch,
            match: {
              certainty: 70,
              matchType: "fastHashAndSize",
              alternativeMatches:
                uniqueFastMatches.filter((m) => m.id !== bestFastMatch.id)
                  .length > 0
                  ? uniqueFastMatches.filter((m) => m.id !== bestFastMatch.id)
                  : undefined,
            },
          });
        }
      }
    }

    // 4. Merkle root match (40% certainty - partial content similarity)
    if (hashes.merkleRoot) {
      const merkleMatches = await this.vpkRepository.findByMerkleRoot(
        hashes.merkleRoot,
      );
      if (merkleMatches.length > 0) {
        // Filter out matches we already found and exact matches
        const uniqueMerkleMatches = merkleMatches.filter(
          (match) =>
            match.sha256 !== hashes.sha256 &&
            match.contentSig !== hashes.contentSignature &&
            !results.some((result) => result.matchedVpk.id === match.id),
        );

        if (uniqueMerkleMatches.length > 0) {
          const bestMerkleMatch = uniqueMerkleMatches.reduce(
            (best, current) => {
              const bestScore = this.calculateHashMatchScore(best, hashes);
              const currentScore = this.calculateHashMatchScore(
                current,
                hashes,
              );
              return currentScore > bestScore ? current : best;
            },
          );

          results.push({
            matchedVpk: bestMerkleMatch,
            match: {
              certainty: 40,
              matchType: "merkleRoot",
              alternativeMatches:
                uniqueMerkleMatches.filter((m) => m.id !== bestMerkleMatch.id)
                  .length > 0
                  ? uniqueMerkleMatches.filter(
                      (m) => m.id !== bestMerkleMatch.id,
                    )
                  : undefined,
            },
          });
        }
      }
    }

    return results;
  }

  private calculateHashMatchScore(
    vpkEntry: CachedVPKWithMod,
    hashes: {
      sha256?: string;
      contentSignature: string;
      fastHash?: string;
      fileSize?: number;
      merkleRoot?: string;
    },
  ): number {
    let score = 0;

    // File size comparison (if available)
    if (hashes.fileSize !== undefined) {
      const fileCountDiff = Math.abs(vpkEntry.fileCount - hashes.fileSize);
      if (fileCountDiff === 0) {
        score += 40;
      } else if (fileCountDiff <= 5) {
        score += 30;
      } else if (fileCountDiff <= 20) {
        score += 15;
      }
    }

    // We can't compare VPK version, multiparts, or inline data from hashes alone
    // So this scoring is simplified compared to the full fingerprint version

    return score;
  }
}
