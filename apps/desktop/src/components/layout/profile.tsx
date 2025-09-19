import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/hooks/use-posthog";

const Profile = () => {
  const { capture } = useAnalytics();

  return (
    <div className='flex flex-col items-start gap-1'>
      <h3 className='font-bold text-sm'>Default</h3>
      <Button
        className='text-xs'
        onClick={() => {
          toast.info("This feature is not yet available. Stay tuned!");
          capture("button_click", {
            button: "change_profile",
            section: "toolbar",
          });
        }}
        size='text'
        variant='text'>
        Change profile
      </Button>
    </div>
  );
};

export default Profile;
