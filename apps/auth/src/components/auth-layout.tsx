import Logo from "./logo";

interface AuthLayoutProps {
  children: React.ReactNode;
  subtitle?: string;
  logoClassName?: string;
}

export function AuthLayout({
  children,
  subtitle,
  logoClassName = "mx-auto h-16 w-auto",
}: AuthLayoutProps) {
  return (
    <div className='flex flex-col justify-center w-xl'>
      <div className='sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4'>
        <Logo className={logoClassName} />
        <h1 className='text-2xl font-semibold tracking-tight text-balance font-primary'>
          <span className='bg-gradient-to-r from-[#EFE1BE] to-primary bg-clip-text text-transparent'>
            Deadlock Mod Manager
          </span>
        </h1>
        {subtitle && (
          <h2 className='text-center font-bold tracking-tight text-foreground'>
            {subtitle}
          </h2>
        )}
      </div>
      {children}
    </div>
  );
}
