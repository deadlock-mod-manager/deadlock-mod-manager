import { Button } from "@deadlock-mods/ui/components/button";
import { Dialog, DialogTrigger } from "@deadlock-mods/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { InfoIcon, PhosphorIcons, Sparkle } from "@deadlock-mods/ui/icons";
import type { Icon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AboutDialog } from "../layout/about-dialog";

type TopbarMenuItemType = {
  id: string;
  title: string;
  icon: Icon;
  dialog?: React.ComponentType;
};

const TopbarMenuItemComponent = ({ item }: { item: TopbarMenuItemType }) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (item.dialog) {
    const DialogComponent = item.dialog;
    return (
      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogTrigger asChild>
          <DropdownMenuItem
            className='cursor-pointer'
            onSelect={(e) => e.preventDefault()}>
            <item.icon className='size-4' weight='duotone' />
            <span>{item.title}</span>
          </DropdownMenuItem>
        </DialogTrigger>
        <DialogComponent />
      </Dialog>
    );
  }

  return (
    <DropdownMenuItem key={item.id}>
      <item.icon className='size-4' weight='duotone' />
      <span>{item.title}</span>
    </DropdownMenuItem>
  );
};

export const TopbarMenu = () => {
  const { t } = useTranslation();
  const items: TopbarMenuItemType[] = [
    {
      id: "about",
      title: t("navigation.about"),
      icon: InfoIcon,
      dialog: AboutDialog,
    },
    {
      id: "whatsNew",
      title: t("navigation.whatsNew"),
      icon: Sparkle,
    },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='transparent'
          size='no-padding'
          className='[&_svg]:size-4'>
          <PhosphorIcons.DotsThreeOutlineVertical weight='fill' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='start' sideOffset={12}>
        {items.map((item) => (
          <TopbarMenuItemComponent key={item.id} item={item} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
