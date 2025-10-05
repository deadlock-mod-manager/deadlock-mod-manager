import { MinimalFooter } from "@/components/minimal-footer";

interface FullscreenLayoutProps {
  children: React.ReactNode;
}

export function FullscreenLayout({ children }: FullscreenLayoutProps) {
  return (
    <div className='flex min-h-screen flex-col'>
      <main className='flex-1 flex justify-center items-center'>
        {children}
      </main>
      <MinimalFooter />
    </div>
  );
}
