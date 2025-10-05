import { createFileRoute } from "@tanstack/react-router";
import LoginForm from "@/components/login-form";
import Logo from "@/components/logo";
import { FullscreenLayout } from "@/layouts/fullscreen-layout";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <FullscreenLayout>
      <div className='flex flex-col justify-center w-xl'>
        <div className='sm:mx-auto sm:w-full sm:max-w-md text-center'>
          <Logo className='mx-auto h-24 w-auto' />
          <h1 className='mt-8 text-2xl font-semibold tracking-tight text-balance font-primary'>
            <span className='bg-gradient-to-r from-[#EFE1BE] to-primary bg-clip-text text-transparent'>
              Deadlock Mod Manager
            </span>
          </h1>
          <h2 className='text-center font-bold tracking-tight text-foreground'>
            Sign in to your account
          </h2>
        </div>

        <div className='mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]'>
          <LoginForm />

          <p className='mt-10 text-center text-sm/6 text-muted-foreground'>
            Not a member?{" "}
            <a
              href='#'
              className='font-semibold text-primary hover:text-primary/80'>
              Start a 14 day free trial
            </a>
          </p>
        </div>
      </div>
    </FullscreenLayout>
  );
}
