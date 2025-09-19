import { Separator } from "@/components/ui/separator";

interface ReleaseNotesProps {
  releaseNotes: string;
}

export const ReleaseNotes = ({ releaseNotes }: ReleaseNotesProps) => (
  <>
    <Separator className='my-6' />
    <div>
      <h3 className='mb-3 font-semibold'>Release Notes</h3>
      <div className='prose prose-sm dark:prose-invert max-w-none'>
        <pre className='overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-muted-foreground text-sm'>
          {releaseNotes}
        </pre>
      </div>
    </div>
  </>
);
