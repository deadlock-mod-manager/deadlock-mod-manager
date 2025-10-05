import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { Link } from "@tanstack/react-router";
import { COPYRIGHT } from "@/lib/constants";

export const MinimalFooter = () => {
  return (
    <footer className='border-t border-border bg-background'>
      <div className='mx-auto max-w-7xl px-4 py-6'>
        <div className='flex flex-col items-center gap-4 text-center'>
          <div className='flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground'>
            <Link
              className='hover:text-foreground transition-colors'
              to='/privacy'>
              Privacy Policy
            </Link>
            <span className='hidden sm:inline'>•</span>
            <Link
              className='hover:text-foreground transition-colors'
              to='/terms'>
              Terms of Service
            </Link>
          </div>

          <p className='text-sm text-muted-foreground'>
            {COPYRIGHT}. Made with{" "}
            <PhosphorIcons.HeartIcon
              weight='duotone'
              className='w-4 h-4 inline-block'
            />{" "}
            by{" "}
            <a
              className='text-primary hover:underline transition-all'
              href='https://github.com/Stormix'
              rel='noopener noreferrer'
              target='_blank'>
              Stormix
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
};
