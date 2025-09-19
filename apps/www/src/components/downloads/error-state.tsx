import { AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOWNLOAD_URL } from "@/lib/constants";

export const ErrorState = () => (
  <div className='container mx-auto max-w-4xl py-12'>
    <div className='mb-8 text-center'>
      <AlertCircle className='mx-auto mb-4 h-12 w-12 text-destructive' />
      <h1 className='mb-4 font-bold text-3xl'>
        Downloads are temporarily unavailable
      </h1>
      <p className='mb-6 text-muted-foreground'>
        We couldn’t fetch the latest releases. You can still grab the installer
        from GitHub.
      </p>
      <Button asChild>
        <a href={DOWNLOAD_URL} rel='noopener noreferrer' target='_blank'>
          <Download className='mr-2 h-4 w-4' />
          Download from GitHub
        </a>
      </Button>
    </div>
  </div>
);
