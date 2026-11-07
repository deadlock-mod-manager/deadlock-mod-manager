"GameInfo"
{
  // SearchPaths { mentioned in a comment } — café
  FileSystem
  {
    "SearchPaths" // engine mounts
    {
      Game_UILanguage citadel_*LANGUAGE*
      // Deadworks Launcher - Start
      Game                citadel/deadworks_mods
      Mod                 citadel
      Write               citadel
      addonroot           citadel/deadworks_addons
      // Deadworks Launcher - End
      Game citadel
      Game core
    }
  }
  ConVars { fps_max 240 }
}