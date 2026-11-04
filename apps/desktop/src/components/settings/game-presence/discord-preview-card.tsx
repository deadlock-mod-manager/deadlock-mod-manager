// Bundled copy of the Discord application's large presence asset.
const PREVIEW_LARGE_IMAGE_URL = "/brand/discord-presence.png";

interface DiscordPreviewCardProps {
  previewDetails: string;
  previewState: string;
  noDetailsText: string;
}

export const DiscordPreviewCard = ({
  previewDetails,
  previewState,
  noDetailsText,
}: DiscordPreviewCardProps) => (
  <div className='rounded-xl bg-[#1e1f24] p-4 text-white shadow-sm'>
    <div className='mb-3 flex items-center justify-between gap-3'>
      <p className='font-semibold text-sm'>Playing</p>
      <div className='flex gap-1'>
        <span className='size-1 rounded-full bg-white/35' />
        <span className='size-1 rounded-full bg-white/35' />
        <span className='size-1 rounded-full bg-white/35' />
      </div>
    </div>
    <div className='flex gap-3'>
      <img
        alt='Deadlock'
        className='size-16 shrink-0 rounded-xl object-cover'
        src={PREVIEW_LARGE_IMAGE_URL}
      />
      <div className='min-w-0 py-0.5'>
        <p className='truncate font-semibold text-sm'>Deadlock</p>
        <p className='truncate text-sm text-white/90'>
          {previewDetails || noDetailsText}
        </p>
        {previewState && (
          <p className='truncate text-sm text-white/90'>{previewState}</p>
        )}
        <p className='mt-1 text-emerald-300 text-sm tabular-nums'>
          3 of 6, 01:24
        </p>
      </div>
    </div>
  </div>
);
