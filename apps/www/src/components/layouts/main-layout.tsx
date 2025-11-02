import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className='min-h-screen'>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
