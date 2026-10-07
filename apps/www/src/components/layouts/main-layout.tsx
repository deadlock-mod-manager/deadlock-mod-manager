import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { V2Banner } from "@/components/v2-banner";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className='flex min-h-screen flex-col'>
      <V2Banner />
      <Navbar />
      <div className='flex-1'>{children}</div>
      <Footer />
    </div>
  );
}
