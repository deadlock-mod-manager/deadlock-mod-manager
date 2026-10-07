import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className='flex min-h-screen flex-col'>
      <Navbar />
      <div className='flex-1'>{children}</div>
      <Footer />
    </div>
  );
}
