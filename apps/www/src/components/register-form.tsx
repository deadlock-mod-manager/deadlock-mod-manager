import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import Loader from "./loader";

const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(64, "Name must be at most 64 characters"),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(100, "Password must be at most 100 characters"),
    confirmPassword: z
      .string()
      .min(8, "Password confirmation must be at least 8 characters"),
    rememberMe: z.boolean().optional(),
    acceptTerms: z
      .boolean()
      .refine((value) => value, "You must accept the terms and privacy policy"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const searchParams = useSearch({ from: "/register" });
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate({ from: "/register" });

  const isDesktopFlow = (searchParams as { desktop?: string }).desktop;

  useEffect(() => {
    const error = (searchParams as { error?: string }).error;
    if (error === "registration_failed") {
      toast.error("Registration failed. Please try again.");
    }
  }, [searchParams]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      rememberMe: true,
      acceptTerms: false,
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    await authClient.signUp.email(
      {
        name: data.name,
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe !== false,
      },
      {
        onSuccess: () => {
          toast.success("Account created successfully");
          if (isDesktopFlow) {
            window.location.href = "/auth/desktop-callback";
          } else {
            navigate({ to: "/" });
          }
        },
        onError: (error) => {
          toast.error(error.error.message || error.error.statusText);
        },
      },
    );
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

  return (
    <div className='bg-card px-6 py-12 shadow-sm sm:rounded-lg sm:px-12 dark:shadow-none dark:outline dark:-outline-offset-1 dark:outline-white/10'>
      <form className='space-y-6' onSubmit={handleSubmit(onSubmit)}>
        <div className='space-y-2'>
          <Label htmlFor='name'>Display name</Label>
          <Input
            id='name'
            type='text'
            autoComplete='name'
            placeholder='John Doe'
            {...register("name")}
          />
          {errors.name && (
            <p className='text-destructive text-sm'>{errors.name.message}</p>
          )}
        </div>

        <div className='space-y-2'>
          <Label htmlFor='email'>Email address</Label>
          <Input
            id='email'
            type='email'
            autoComplete='email'
            placeholder='your@email.com'
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
            autoComplete='new-password'
            {...register("password")}
          />
          {errors.password && (
            <p className='text-destructive text-sm'>
              {errors.password.message}
            </p>
          )}
        </div>

        <div className='space-y-2'>
          <Label htmlFor='confirmPassword'>Confirm password</Label>
          <Input
            id='confirmPassword'
            type='password'
            autoComplete='new-password'
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className='text-destructive text-sm'>
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <div className='flex flex-col gap-4'>
          <label className='flex items-start gap-3 text-sm text-muted-foreground'>
            <Controller
              control={control}
              name='acceptTerms'
              render={({ field }) => (
                <Checkbox
                  id='acceptTerms'
                  checked={field.value ?? false}
                  onCheckedChange={(value) => field.onChange(value === true)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              )}
            />
            <span>
              I agree to the{" "}
              <Link
                to='/terms'
                className='font-semibold text-primary hover:text-primary/80'>
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                to='/privacy'
                className='font-semibold text-primary hover:text-primary/80'>
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.acceptTerms && (
            <p className='text-destructive text-sm'>
              {errors.acceptTerms.message}
            </p>
          )}
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
                  Remember me on this device
                </Label>
              </div>
            )}
          />
        </div>

        <Button type='submit' disabled={isSubmitting} className='w-full'>
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <div className='mt-6 text-center text-sm text-muted-foreground'>
        Already have an account?{" "}
        <Link
          to='/login'
          className='font-semibold text-primary hover:text-primary/80'>
          Sign in
        </Link>
      </div>
    </div>
  );
}
