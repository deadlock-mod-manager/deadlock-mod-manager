import {
  type ModDownloadVpkWithMod,
  vpkRepository,
} from "@deadlock-mods/database";
import { type VpkParsed, VpkParser } from "@deadlock-mods/vpk-parser";

type MatchType =
  | "sha256"
  | "contentSignature"
  | "fastHashAndSize"
  | "merkleRoot";

type ModMatchResult = {
  vpkEntry: ModDownloadVpkWithMod;
  certainty: number;
  matchType: MatchType;
  alternativeMatches?: ModDownloadVpkWithMod[];
};

type VpkAnalysisResult = {
  vpk: VpkParsed;
  matchedVpk?: ModDownloadVpkWithMod;
  match?: {
    certainty: number;
    matchType: MatchType;
    alternativeMatches?: ModDownloadVpkWithMod[];
  };
};

export class ModAnalyser {
  private static _instance: ModAnalyser | null = null;
  private constructor() {}

  static get instance(): ModAnalyser {
    if (!ModAnalyser._instance) {
      ModAnalyser._instance = new ModAnalyser();
    }
    return ModAnalyser._instance;
  }

  async getModInfo(parsedVpk: VpkParsed): Promise<ModMatchResult | null> {
    const fingerprint = parsedVpk.fingerprint;

    const sha256Match = await vpkRepository.findBySha256(fingerprint.sha256);
    if (sha256Match) {
      return {
        vpkEntry: sha256Match,
        certainty: 100,
        matchType: "sha256",
      };
    }

    const contentSigMatches = await vpkRepository.findByContentSignature(
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
    const fastHashMatches = await vpkRepository.findByFastHashAndSize(
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
      const merkleMatches = await vpkRepository.findByMerkleRoot(
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
    vpkEntry: ModDownloadVpkWithMod,
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
    const parsed = await VpkParser.parse(file, {
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
}
