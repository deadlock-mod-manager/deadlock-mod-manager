import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { FaGithub, FaSteam } from "react-icons/fa";
import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import Loader from "./loader";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  rememberMe: z.boolean().optional(),
});

const steamEmailSchema = z.object({
  steamEmail: z.string().email("Invalid email address"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type SteamEmailFormData = z.infer<typeof steamEmailSchema>;

export default function LoginForm() {
  const searchParams = useSearch({ from: "/login" });
  const { data: session, isPending } = authClient.useSession();
  const [showSteamEmailPrompt, setShowSteamEmailPrompt] = useState(false);
  const navigate = useNavigate({ from: "/login" });

  const isDesktopFlow = (searchParams as { desktop?: string }).desktop;

  useEffect(() => {
    const error = (searchParams as { error?: string }).error;
    if (error === "steam_auth_failed") {
      toast.error("Steam authentication failed. Please try again.");
    }
  }, [searchParams]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  const {
    register: registerSteam,
    handleSubmit: handleSteamSubmit,
    formState: { errors: steamErrors, isSubmitting: isSteamSubmitting },
  } = useForm<SteamEmailFormData>({
    resolver: zodResolver(steamEmailSchema),
    defaultValues: {
      steamEmail: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    await authClient.signIn.email(
      {
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe === true,
      },
      {
        onSuccess: () => {
          if (isDesktopFlow) {
            window.location.href = "/auth/desktop-callback";
          } else {
            navigate({ to: "/" });
            toast.success("Sign in successful");
          }
        },
        onError: (error) => {
          toast.error(error.error.message || error.error.statusText);
        },
      },
    );
  };

  const onSteamSubmit = async (data: SteamEmailFormData) => {
    authClient.signIn.steam({
      callbackURL: isDesktopFlow
        ? `${window.location.origin}/auth/desktop-callback`
        : `${window.location.origin}/`,
      errorCallbackURL: `${window.location.origin}/login?error=steam_auth_failed${isDesktopFlow ? "&desktop=true" : ""}`,
      email: data.steamEmail,
    });
  };

  if (isPending) {
    return <Loader />;
  }

  if (session) {
    if (isDesktopFlow) {
      window.location.href = "/auth/desktop-callback";
      return <Loader />;
    }
    navigate({ to: "/" });
    return <Loader />;
  }

  if (showSteamEmailPrompt) {
    return (
      <div className='bg-card px-6 py-12 shadow-sm sm:rounded-lg sm:px-12 dark:shadow-none dark:outline dark:-outline-offset-1 dark:outline-white/10'>
        <div className='mb-6'>
          <h2 className='text-2xl font-semibold text-foreground'>
            Sign in with Steam
          </h2>
          <p className='text-muted-foreground mt-2 text-sm'>
            Please provide your email address to continue with Steam login.
          </p>
        </div>

        <form className='space-y-6' onSubmit={handleSteamSubmit(onSteamSubmit)}>
          <div className='space-y-2'>
            <Label htmlFor='steamEmail'>Email address</Label>
            <Input
              id='steamEmail'
              type='email'
              autoComplete='email'
              placeholder='your@email.com'
              {...registerSteam("steamEmail")}
            />
            {steamErrors.steamEmail && (
              <p className='text-destructive text-sm'>
                {steamErrors.steamEmail.message}
              </p>
            )}
          </div>

          <div className='flex gap-3'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowSteamEmailPrompt(false)}
              className='w-full'>
              Back
            </Button>
            <Button
              type='submit'
              disabled={isSteamSubmitting}
              className='w-full'>
              {isSteamSubmitting ? "Continuing..." : "Continue with Steam"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className='bg-card px-6 py-12 shadow-sm sm:rounded-lg sm:px-12 dark:shadow-none dark:outline dark:-outline-offset-1 dark:outline-white/10'>
      <form className='space-y-6' onSubmit={handleSubmit(onSubmit)}>
        <div className='space-y-2'>
          <Label htmlFor='email'>Email address</Label>
          <Input
            id='email'
            type='email'
            autoComplete='email'
            {...register("email")}
          />
          {errors.email && (
            <p className='text-destructive text-sm'>{errors.email.message}</p>
          )}
        </div>

        <div className='space-y-2'>
          <Label htmlFor='password'>Password</Label>
          <Input
            id='password'
            type='password'
            autoComplete='current-password'
            {...register("password")}
          />
          {errors.password && (
            <p className='text-destructive text-sm'>
              {errors.password.message}
            </p>
          )}
        </div>

        <div className='flex items-center justify-between'>
          <Controller
            control={control}
            name='rememberMe'
            render={({ field }) => (
              <div className='flex items-center gap-2'>
                <Checkbox
                  id='rememberMe'
                  checked={field.value ?? false}
                  onCheckedChange={(value) => field.onChange(value === true)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
                <Label
                  htmlFor='rememberMe'
                  className='cursor-pointer font-normal text-sm'>
                  Remember me
                </Label>
              </div>
            )}
          />

          <div className='text-sm/6'>
            <a
              href='#'
              className='font-semibold text-primary hover:text-primary/80'>
              Forgot password?
            </a>
          </div>
        </div>

        <Button type='submit' disabled={isSubmitting} className='w-full'>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div>
        <div className='mt-10 flex items-center gap-x-6'>
          <div className='w-full flex-1 border-t border-border' />
          <p className='text-sm/6 font-medium text-nowrap text-foreground'>
            Or continue with
          </p>
          <div className='w-full flex-1 border-t border-border' />
        </div>

        <div className='mt-6 grid grid-cols-2 gap-4'>
          <Button
            onClick={() => setShowSteamEmailPrompt(true)}
            className='flex w-full items-center justify-center gap-3 rounded-md bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-xs inset-ring inset-ring-border hover:bg-accent focus-visible:inset-ring-transparent'>
            <FaSteam />
            <span className='text-sm/6 font-semibold'>Steam</span>
          </Button>

          <Button
            onClick={() => {
              authClient.signIn.social({
                provider: "github",
                callbackURL: isDesktopFlow
                  ? `${window.location.origin}/auth/desktop-callback`
                  : `${window.location.origin}/`,
              });
            }}
            className='flex w-full items-center justify-center gap-3 rounded-md bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-xs inset-ring inset-ring-border hover:bg-accent focus-visible:inset-ring-transparent'>
            <FaGithub />
            <span className='text-sm/6 font-semibold'>GitHub</span>
          </Button>
        </div>

        <div className='mt-6 text-center text-sm text-muted-foreground'>
          Do not have an account?{" "}
          <Link
            to='/register'
            className='font-semibold text-primary hover:text-primary/80'>
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
