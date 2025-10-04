import { Loader2 } from "@deadlock-mods/ui/icons";

export default function Loader() {
  return (
    <div className='flex h-full items-center justify-center pt-8'>
      <Loader2 className='animate-spin' />
    </div>
  );
}
