import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { OSInfo, PlatformDownload, Release } from "@/types/releases";
import { AllDownloads } from "./all-downloads";
import { RecommendedDownload } from "./recommended-download";
import { ReleaseNotes } from "./release-notes";

interface ReleaseCardProps {
  release: Release;
  userOS: OSInfo | null;
  recommendedDownload: PlatformDownload | null;
}

export const ReleaseCard = ({
  release,
  userOS,
  recommendedDownload,
}: ReleaseCardProps) => (
  <Card className='mb-8'>
    <CardHeader>
      <div className='flex items-center justify-between'>
        <div>
          <CardTitle className='flex items-center gap-2'>
            Version {release.version}
            {release.prerelease && (
              <Badge variant='secondary'>Pre-release</Badge>
            )}
            <Badge variant='outline'>Latest</Badge>
          </CardTitle>
          <CardDescription className='mt-2 flex items-center gap-2'>
            <Calendar className='h-4 w-4' />
            Released {new Date(release.publishedAt).toLocaleDateString()}
          </CardDescription>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      {/* Recommended Download */}
      {userOS && userOS.os !== "unknown" && recommendedDownload && (
        <RecommendedDownload download={recommendedDownload} userOS={userOS} />
      )}

      <Separator className='my-6' />

      {/* All Downloads */}
      <AllDownloads downloads={release.downloads} />

      {/* Release Notes */}
      {release.releaseNotes && (
        <ReleaseNotes releaseNotes={release.releaseNotes} />
      )}
    </CardContent>
  </Card>
);
