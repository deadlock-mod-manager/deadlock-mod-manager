import { useTranslation } from "react-i18next";
import { IMAGE_SCREENS } from "./image-screens";

/** Screens shown as real captures of the app's content area. */
export const ImageScreen = ({
  screen,
}: {
  screen: keyof typeof IMAGE_SCREENS;
}) => {
  const { t } = useTranslation("preview");
  return (
    <img
      src={IMAGE_SCREENS[screen]}
      alt={t(`screens.${screen}Alt`)}
      width={1199}
      height={825}
      loading='lazy'
      className='block w-full'
    />
  );
};
