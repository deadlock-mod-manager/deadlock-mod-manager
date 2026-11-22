import { type CachedVPK, db, VpkRepository } from "@deadlock-mods/database";
import { type VpkParsed, VpkParser } from "@deadlock-mods/vpk-parser";

type MatchType =
  | "sha256"
  | "contentSignature"
  | "fastHashAndSize"
  | "merkleRoot";

type ModMatchResult = {
  vpkEntry: CachedVPK;
  certainty: number;
  matchType: MatchType;
  alternativeMatches?: CachedVPK[];
};

type VpkAnalysisResult = {
  vpk: VpkParsed;
  matchedVpk?: CachedVPK;
  match?: {
    certainty: number;
    matchType: MatchType;
    alternativeMatches?: CachedVPK[];
  };
};

type HashAnalysisResult = {
  matchedVpk: CachedVPK;
  match: {
    certainty: number;
    matchType: MatchType;
    alternativeMatches?: CachedVPK[];
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

    const fastHashMatches = await this.vpkRepository.findByFastHashAndSize(
      fingerprint.fastHash,
      fingerprint.fileSize,
    );
    if (fastHashMatches.length > 0) {
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

    if (fingerprint.merkleRoot) {
      const merkleMatches = await this.vpkRepository.findByMerkleRoot(
        fingerprint.merkleRoot,
      );
      if (merkleMatches.length > 0) {
        const uniqueMerkleMatches = merkleMatches.filter(
          (match) =>
            match.sha256 !== fingerprint.sha256 &&
            match.contentSig !== fingerprint.contentSignature,
        );

        if (uniqueMerkleMatches.length > 0) {
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
    vpkEntry: CachedVPK,
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
        return results;
      }
    }

    const contentSigMatches = await this.vpkRepository.findByContentSignature(
      hashes.contentSignature,
    );
    if (contentSigMatches.length > 0) {
      const bestContentMatch = this.closestBySize(
        contentSigMatches,
        hashes.fileSize,
      );
      const alternativeMatches = contentSigMatches.filter(
        (m) => m.id !== bestContentMatch.id,
      );

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

    if (hashes.fastHash && hashes.fileSize !== undefined) {
      const fastHashMatches = await this.vpkRepository.findByFastHashAndSize(
        hashes.fastHash,
        hashes.fileSize,
      );
      if (fastHashMatches.length > 0) {
        const uniqueFastMatches = fastHashMatches.filter(
          (match) =>
            !results.some((result) => result.matchedVpk.id === match.id),
        );

        if (uniqueFastMatches.length > 0) {
          const bestFastMatch = this.closestBySize(
            uniqueFastMatches,
            hashes.fileSize,
          );

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

    if (hashes.merkleRoot) {
      const merkleMatches = await this.vpkRepository.findByMerkleRoot(
        hashes.merkleRoot,
      );
      if (merkleMatches.length > 0) {
        const uniqueMerkleMatches = merkleMatches.filter(
          (match) =>
            match.sha256 !== hashes.sha256 &&
            match.contentSig !== hashes.contentSignature &&
            !results.some((result) => result.matchedVpk.id === match.id),
        );

        if (uniqueMerkleMatches.length > 0) {
          const bestMerkleMatch = this.closestBySize(
            uniqueMerkleMatches,
            hashes.fileSize,
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

  private closestBySize(
    candidates: CachedVPK[],
    fileSize: number | undefined,
  ): CachedVPK {
    const distance = (vpk: CachedVPK) =>
      fileSize === undefined ? 0 : Math.abs(vpk.sizeBytes - fileSize);
    return candidates.reduce((best, current) =>
      distance(current) < distance(best) ? current : best,
    );
  }
}
