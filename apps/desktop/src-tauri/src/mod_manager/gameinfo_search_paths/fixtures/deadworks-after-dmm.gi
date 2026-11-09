"GameInfo"
{
  // SearchPaths { mentioned in a comment } — café
  FileSystem
  {
    "SearchPaths" // engine mounts
    {
      Game_UILanguage citadel_*LANGUAGE*
      // Deadlock Mod Manager - Start (SearchPaths v2)
      // Deadworks Launcher - Start
      Game                citadel/deadworks_mods
      addonroot           citadel/deadworks_addons
      // Deadworks Launcher - End
      Game		citadel/addons/server_test // dmm-search-path
      Game		citadel/addons2/profile_test // dmm-search-path
      Mod		"citadel" // dmm-search-path
      Write		"citadel" // dmm-search-path
      // Deadlock Mod Manager (SearchPaths v2) - End
      Game citadel
      Game core
    }
  }
  ConVars { fps_max 240 }
}