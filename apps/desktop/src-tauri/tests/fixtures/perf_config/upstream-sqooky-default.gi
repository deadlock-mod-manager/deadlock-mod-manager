//      If you would like to donate as a means of showing thanks I have a kofi.     \\
//      https://ko-fi.com/sqooky                                                    \\
//           ...       ....
//        ...   ..   ..    ...
//       .        . .  o      .
//      .          v           .
//      . o       ___     o    .
//      .     _---   -_      .
//     o .   /^        '\     .
//        . /   _- /|.  |  o
//          |f1/0   @\Y?u\
//      o   /u'\_ v _/ f:j|    o
//         /!#%|'-_- '\%k*|
//     o   |*@/        \_/
//         \)&|
// OptimizationLock Version 3.4 by Sqooky with help from others <3

// As much as I would love to say I did this alone, I did not. These are the amazing people who deserve as much praise as I, if not more
//  Major thanks to all of these individuals from the bottom of my heart. They are all lovely.
//- Sqooky:             I am the primary developer and maintainer of the project, but without everyone else here this project would not be maintained to this degree.
//- JasperP:            My personal hero. (Valve dev who reached out to me due to my work on the project.)
//- Boot:               Provided the csm cvars which had a notable performance improvement.
//- Brullee:            Removed fake cvars, redundant commands, added cvarlist.md, and reformatted config.
//- Kaizuchaneru:       While not directly invovled in the deveopment, they tested most cvars.
//- Tamara Mochaccina:  Contributed vindicta scope fix and the fog fix.
//- Liah:               Found a cvar causing a weird issue.

// Donors. Thank you so much. Even considering that you would view my work as deserving of any donation at all is incredible. I love you all
//- Boot:           Gave me FIVE DOLLARS and is just a wonderful person and friend at a baseline
//- Sonny:          Gave me FIVE DOLLARS and waited through me setting up a paypal account and didn't change their mind
//- Soulx:          Gave me FIVE DOLLARS and told me about spirolactone
//- Xeno:           Very politely waited for me to figure out how to accept donations and gave me FIVE DOLLARS
//- N8Fan:          Gave me TEN DOLLARS so I could play vampire survivors
//- Cos:            GAVE ME SEVENTY DOLLARS FOR NO FUCKING REASON I LOVE YOU SO MUCH?????????????????????????
//- Wely:           Gave me THIRTY DOLLARS IN STEAM GIFT CARD MONEY????? WOA
//- Prot4g:         Gave me TWENTY DOLLARS WOA I LOVE YOU!!!
//- catmasta:       Gave me TWO DOLLARS!!
//- a distant admirer: Gave me TEN DOLLARS and a boon!!!
//- Namea:          Gave me TEN DOLLARS in steam gift cards and was unbelivably polite. I love you so much.
//- Kevin:          Gave me TWO DOLLARS also made me trip and write this as kelvin twice. I'm such a mcginnis chud.
//- jusbeprophet:   Gave me ONE DOLLAR! Bless their heart
//- Supporter:      Gave me FIVE DOLLAR!!! many thanks to them.
//- WhoLovesDean:   Incredibly kind fellow and gave me THIRTY DOLLARS
//- john6674:       Gave me TWENTY FIVE DOLLARS that's wild. Thank you john, please take care <3
//- noelle:         Gave me FIVE DOLLAR and is nice with a cool username. Tyyyy
//- exazinho:       First person to subscribe to me on kofi. That's amazing. Huge thank you exazinho. I'm glad you saw my little doodle <3
//- Shotty:         Left an incredibly nice donation message and gave me THIRTY DOLLAR. I'm honored please take care.
//- TheLastFriendly: GAVE ME 100 DOLLARS FOR CLOTHES  I LOVE YOU SO MUCH
//- Olly/Moozen:    Has been an incredible friend for putting up with me. Also gave me thirty bucks for working on some stuff for them ily <3
//- Neytir:         Extremely fun person to talk to and consitent viewer of my streams. Gave me twenty bucks and subscribed on twitch so I could buy balatro! Much love
//- Bytenode:       Taught me everything I know about hud editing, gave me EIGHTY BUCKS AND FIVE CENTS gave me pronoun palace, subscribed on twitch, and is incredibly nice across the board. Much much much love.
//- John Dreamerman: Gave me money in my dream after I explained what r_farz did to him. Isn't bytenode.
//- Martinchodou:   Gave me ONE DOLLAR. Much love. Please take care.
//- HaloKat/June:   Gave me FIVE dollar for breast reduction surgery. Incredible bestie.
//- 6Daves:         Incredibly nice person and has been continually supportive for the duration I have been working on the project. Gave me two dollars and subscribed on twitch. Much love. <3
//- Ehmed:          First twitch subscriber and certified awesome person.
//- NawyLo3b:       A twitch sub :D
//- leroyaxrs:      Incredibly kind and supportive person I'm so glad I met. Thank you for being a delight to talk with.
//- eleanordl:      First person to recognize me ingame and was super nice. Also subscribed on twitch which was incredibly nice.
//- LokiSquared:    Incredibly polite and fun person to talk to. Also gave me a twitch sub :D
//- Mr. Miyagi:     Made my summer and gave me slay the spire 2 on steam. My goat fr fr
//- Connermadethis: Donated FORTY DOLLAR OH MINE GOTT THANK YOU
//- Noelle:         Gave me FIVE DOLLAR and invited me to her matrix instance. I love you :D
//- Blerg:          Gave me FIFTY FIVE DOLLARS OH MY GOD TY please let me know if I can help
//- Drykdap:        Gave me TEN DOLLAR thank youuuuuuuuuuuuuuuuuuuuuuuuu please call me if need be
//- Salem:          Gave me FIVE DOLLAR for helping them with performance and tech support in the official deadlock server. thank youuuuuuuu
//- attention seeker: for donating 18 dollars (one dollar for each % improvement of 1% lows lol)
//- DungeonMaestro: Gave me a dollar for a bit
//- Smugfox:        Gave me five DOLLAR out of kindness :)
//- TheTurtlezsz:   Gave me FIVE DOLLAR asking for tech support :D
//- Supporter:      Gave me two dollar anoymously.
//- Umah:           Gave me TEN DoLLAR for cute clothes. I love you so much thank you
//- Connormadethis: Gave ne FORTY DOLLAR.... too much.... heroic....
//- Cele:           Gave me FIVE DOLLAR and was very respectful asking a question
//- faux_astre:     Gave me FIVE DOLLAR and lef a very kind message
//- MidnightSojuTv: Gave me five dollars for providing an answer to their question <3
//- blert:          Gave me seben dollar for clothes... <33
//- Shinjoto:       Gave me ten dollars (love you)
//- Yawn:           Gave me way too much money and support, I owe them a kidney.
//- TurtleBoy:      Gave me Fifteen dollars! many thanksss
//- Supporter:      GAVE ME TWENTY OOG
//- Ludo:           GAVE ME TOO MUCH MONEY IN THE FORM OF 120 DOLLARS OOOOOG I OWE THEM MY LIVER
//- odie:           Commissioned me!
//- sixsav:         GAVE ME TWENTY DOLLAR... wonderful and I owe them
//- salvator:       Game me FVIE DOLLAR and is lovely
//- CHANG:
//- Shotty:
//- maeaissance:
//- sae sushio:
//- dec:
//- onetapman:
//- Habitus:
//- max:
//- bingbinginc:
//- aeyri:
//- Supporter:
//- soulx:
//- Supporter:
//- NSH:
//- crush:
//- Jill:
//- Stable:
//- Supporter:
//- Isabellawa:
//- nostmau:
//- NicanorGordon:
//- Harry:



// Translators
//- Egyptianscale: Translated to Russian
//- Tamara Mochaccina and Heathen: Translated to Spanish
//- Linaa and anartoast: Translated to Portuguese
//- Macchiako:  Translated to Bulgarian
//- Cyvoid:     Translated to Italian
//- Vi:         Translated to French
//- ZHTodd223:  Translated to Chinese
//- Sasha11711: Translated to Ukrainian!

// Misc
//- Artemon121:     Made the Citadel cvar unhider, which helped Abdalla fetch cvars and test in-game.
//- Dacooder:       Made a lovely video showcasing myself and my work
//- Kin:            Did an insane amount of benchmarking unprompted.
//- Kunet:          Made a formatter for the gameinfo sytax! This is why things are properly indented! That's LIT.
//- Maihdenless:    Started the original OptimisationLock & its Discord.
//- Piggy:          Let me mirror his config.

// Wonderful People Who Sourced Screenshots for me <33333
//- Abooo
//- Dirtkiller23/Aricole
//- Thai
//- Boot
//- Lina 🜏

// Cool people I've met because of this project who I want to thank anyway
//- 6Daves
//- Achira
//- Anartoast
//- Boot
//- GoreDaughter
//- Jaden
//- Jasper
//- Jb
//- Kin
//- Krisha
//- Masteroms
//- PeachCebo
//- Tamara Mochaccina
//- And you, thank you for using this and making my day <3. Please take care of yourselves.


GameInfo
{
    game        "citadel"
    title       "Citadel"
    type        "multiplayer_only"
    nomodels    "1"
    nohimodel   "1"
    nocrosshair "0"
    hidden_maps
    {
        test_speakers "1"
        test_hardware "1"
    }
    nodegraph   "0"
    perfwizard  "0"
    tonemapping "0"
    GameData    "citadel.fgd"

    PGIVersion "39A735A413003C88A806B364C32DFC6D077E551B9E4EC6C7B11D41E8E67BFA0C"

    Localize
    {
        DuplicateTokensAssert "1"
    }

    SupportedLanguages
    {
        brazilian  "3"
        czech      "3"
        english    "3"
        french     "3"
        german     "3"
        italian    "3"
        indonesian "3"
        japanese   "3"
        koreana    "3"
        latam      "3"
        polish     "3"
        russian    "3"
        schinese   "3"
        spanish    "3"
        thai       "3"
        turkish    "3"
        ukrainian  "3"
    }

    FileSystem
    {
        //
        // The code that loads this file automatically does a few things here:
        //
        // 1. For each "Game" search path, it adds a "GameBin" path, in <dir>\bin
        // 2. For each "Game" search path, it adds another "Game" path in front of it with _<language> at the end.
        //    For example: c:\hl2\cstrike on a french machine would get a c:\hl2\cstrike_french path added to it.
        // 3. If no "Mod" key, for the first "Game" search path, it adds a search path called "MOD".
        // 4. If no "Write" key, for the first "Game" search path, it adds a search path called "DEFAULT_WRITE_PATH".
        //

        //
        // Search paths are relative to the exe directory\..\
        //
        SearchPaths
        {
            // These are optional language paths. They must be mounted first, which is why there are first in the list.
            // *LANGUAGE* will be replaced with the actual language name. If not running a specific language, these paths will not be mounted
            // These currently hold localized images containing text, so they need to follow the UI language, not the audio language.
            // When we ship localized VO, it should go in a separate Game_AudioLanguage path (e.g. citadel_vo_*LANGUAGE*)
            Game_UILanguage "citadel_*LANGUAGE*"

            // These are optional low-violence paths. They will only get mounted if you're in a low-violence mode.
            Game_UILanguage  "citadel_*LANGUAGE*"
            Game_LowViolence "citadel_lv"

            Mod   "citadel"
            Write "citadel"
            Game  "citadel/custom"
            Game  "citadel/addons"
            Game  "citadel"
            Game  "core"
        }

        LegacyUserSettingsPathID "MOD"
        UserSettingsPathID       "USRLOCAL" // this needs to be commented out in order to have citadel/cfg/video.txt usable, however if this is commented out it will force you into low violence mode (make drifter and mina purple)
        // If it isn't commented out then you will need to edit the video.txt located at
        // Windows: \steam\userdata\your_steam_id\1422450\local\cfg
        // Linux:  ~/.steam/steam/userdata/your_steam_id/1422450/local/

    }

    MaterialSystem2
    {
        RenderModes
        {
            game "Default"
            game "Forward"
            game "Deferred"
            game "Outline"
            game "Depth"
            game "FrontDepth"
            game "ShadowSilhouette"

            dev "ToolsVis"       // Visualization modes for all shaders (lighting only, normal maps only, etc.)
            dev "ToolsWireframe" // This should use the ToolsVis mode above instead of being its own mode\

            tools "ToolsUtil" // Meant to be used to render tools sceneobjects that are mod-independent, like the origin grid
        }
    }

    MaterialEditor
    {
        DefaultShader "environment_texture_set"
    }

    NetworkSystem
    {
        BetaUniverse
        {
            FakeLag  "40"
            FakeLoss ".1"
            //FakeReorderPct 0.05
            //FakeReorderDelay 10
            //FakeJitter "low"
            // Turning off fake jitter for now while I work on making the CQ totally solid
            FakeReorderPct   "0"
            FakeReorderDelay "0"
            FakeJitter       "off"
        }

        SkipRedundantChangeCallbacks "1"
    }

    RenderSystem
    {
        GraphicsPipelineLibrary            "1"    // This seemed to discard precompiled shaders when set to 0             [def: "1"]
        IndexBufferPoolSizeMB              "128"  // Not fully sure, in cs2 this is 64        [def: "32"]
        LowLatency                         "1"    //      [def: "1"]
        MinStreamingPoolSizeMB             "2048" // In CS2 this is 500, not sure why      [def: "1024"]
        MinStreamingPoolSizeMBTools        "2048" //      [def: "2048"]
        SwapChainSampleableDepth           "1"    //      [def: "1"]
        Use32BitDepthBuffer                "0"    //      [def: "0"]
        Use32BitDepthBufferWithoutStencil  "0"    //      [def: "0"]
        UseReverseDepth                    "1"    // Also not fully sure.                     [def: "1"]
        VulkanAdditionalShaderCache        "vulkan_shader_cache.foz"
        VulkanDefrag                       "1"   //      [def: "1"]
        VulkanMutableSwapchain             "1"   //      [def: "1"]
        VulkanOnlyTestProbability          "0"   // Jasper said that "[when set to 1] this makes users have a 1% chance of using Vulkan" [def: "0"]
        VulkanOnly_Linux                   "1"   //      [def: "1"]
        VulkanRequireDescriptorIndexing    "1"   // Setting this command to zero causes my wayland compositor to crash upon launching the game. I would imagine don't fiddle with it      [def: "1"]
        VulkanRequireSubgroupWaveOpSupport "1"   //      [def: "1"]
        VulkanStagingPMBSizeLimitMB        "768" // Jasper (my beloved) said to not mess withthis
        VulkanSteamAppShaderCache          "1"   //      [def: "1"]
        VulkanSteamDownloadedShaderCache   "1"   //      [def: "1"]
        VulkanSteamShaderCache             "1"   //      [def: "1"]



        MaxPreloadTextureResolution           "0" // this stems from the dll so you can assume that there is no default value.
        AllowPartialMipChainImmediateTexLoads "1"


    }

    NVNGX
    {
        AppID        "103371621"
        SupportsDLSS "1"
    }

    Engine2
    {
        HasModAppSystems "1"
        Capable64Bit     "1"
        URLName          "citadel"
        RenderingPipeline
        {
            SupportsMSAA  "0"
            DistanceField "1"
        }
        PauseSinglePlayerOnGameOverlay "1"
        PauseOnCtrlConsole             "0" // Src2 issues a 'setpause' on holding down CTRL + toggleconsole key, disable this for Deadlock.
        DefensiveConCommands           "1"
        DisableLoadingPlaque           "1"
        LocalServerClientAccess        "1"

        MapMaxCoord "32768"
    }

    ContentBuilder
    {
        ResourceCompilerDirectXUsesWARP "0"
    }

    SoundSystem
    {
        SteamAudioEnabled   "1"
        WaveDataCacheSizeMB "256"
        UsePlatTime         "1"
    }
    Sounds
    {
        HierarchicalEncodingFiles "1"
    }

    ToolsEnvironment
    {
        Engine   "Source 2"
        ToolsDir "../sdktools" // NOTE: Default Tools path. This is relative to the mod path.
    }

    pulse
    {
        pulse_enabled "1"
    }

    Hammer
    {
        fgd                           "citadel.fgd" // NOTE: This is relative to the 'game' path.
        GameFeatureSet                "Citadel"
        DefaultSolidEntity            "trigger_multiple"
        DefaultPointEntity            "info_player_start"
        NavMarkupEntity               "func_nav_markup"
        OverlayBoxSize                "8"
        TileMeshesEnabled             "1"
        RenderMode                    "ToolsVis"
        CreateRenderClusters          "1"
        DefaultMinDrawVolumeSize      "2048"
        DefaultMinTrianglesPerCluster "16384"
        TileGridSupportsBlendHeight   "1"
        TileGridBlendDefaultColor     "0 255 0"
        LoadScriptEntities            "0"
        UsesBakedLighting             "1"
        UseAnalyticGrid               "0"
        SupportsDisplacementMapping   "0"
        SteamAudioEnabled             "1"
        LatticeDeformerEnabled        "1"
        ShadowAtlasWidth              "16384"
        ShadowAtlasHeight             "16384"
        TimeSlicedShadowMapRendering  "1"
    }

    SoundTool
    {
        DefaultSoundEventType "src1_3d"

        SoundEventBaseOptions
        {
            Base.Announcer.VO.2d     ""
            Base.World.VO.Emitter.3d ""
            Base.Hero.VO.Ping.2d     ""
            Base.Hero.VO.2d          ""
            Base.Hero.VO.3d          ""
            Base.Hero.VO.Ability.3d  ""
            Base.Hero.VO.Ultimate.3d ""
            Base.Hero.VO.Dash.3d     ""
            Base.Hero.VO.Effort.3d   ""
            Base.Hero.VO.Pain.3d     ""
            Base.Hero.VO.Melee.3d    ""
            Base.Hero.VO.Death.3d    ""
        }
    }

    RenderPipelineAliases
    {
    }

    ResourceCompiler
    {
        // Overrides of the default builders as specified in code, this controls which map builder steps
        // will be run when resource compiler is run for a map without specifiying any specific map builder
        // steps. Additionally this controls which builders are displayed in the hammer build dialog.
        DefaultMapBuilders
        {
            bakedlighting "1" // Enable lightmapping during compile time
            envmap        "0" // turned off since it currently causes an assert and doesn't work due to some build issue
            nav           "1" // Generate nav mesh data
            sareverb      "0" // Bake Steam Audio reverb
            sapaths       "0" // Bake Steam Audio pathing
            sacustomdata  "1" // Bake Steam Audio custom data
        }

        // Game specific steps run after the map has been built, in the order they are listed here
        GameSpecificPostMapBuildSteps
        {
            pve_nav_cache "1" // Bake the spots the PVE directors spawn things on
        }

        MeshCompiler
        {
            OptimizeForMeshlets       "1"
            TrianglesPerMeshlet       "64" // Maximum valid value currently is 126
            UseMikkTSpace             "1"
            EncodeVertexBuffer        "1"
            EncodeVertexBufferVersion "1"
            EncodeVertexBufferLevel   "3"
            EncodeIndexBuffer         "1"
            SplitDepthStream          "1"
        }

        WorldRendererBuilder
        {
            VisibilityGuidedMeshClustering     "1"
            MinimumTrianglesPerClusteredMesh   "8192"
            MinimumVerticesPerClusteredMesh    "8192"
            MinimumVolumePerClusteredMesh      "8192" // ~20x20x20 cube
            MaxPrecomputedVisClusterMembership "96"
            MaxCullingBoundsGroups             "128"
            UseAggregateInstances              "1"
            AggregateInstancingMeshlets        "1"
            BakePropsWithExtraVertexStreams    "1"
            MergeTranslucents                  "1"
        }

        BakedLighting
        {
            Version                          "4"
            ImportanceVolumeTransitionRegion "512" // distance we transition from high to low resolution charts
            LightmapChannels
            {
                direct_light_shadows          "1"
                debug_chart_color             "1"
                directional_irradiance_sh2_dc "1"

                directional_irradiance_sh2_r
                {
                    CompressedFormat "DXT1"
                }

                directional_irradiance_sh2_g
                {
                    CompressedFormat "DXT1"
                }

                directional_irradiance_sh2_b
                {
                    CompressedFormat "DXT1"
                }
            }
            LightmapGutterSize   "2" // For bicubic filtering
            UseStaticLightProbes "0"
            LPVAtlas             "1"
        }

        SteamAudio
        {
            ReverbDefaults
            {
                GridGenerationType          "0" // 0: Automatic, Everywhere, 1: Automatic, Use Probe Generation Volume, 2: Manual
                FilterUsingVolumes          "1" // Filter Using Probe Exclusion Volumes ( boolean )
                FilterUsingNavMesh          "0" // Filter Using NavMesh
                GridSpacing                 "3.0"
                HeightAboveFloor            "1.5"
                RebakeOption                "0" // 0: cleanup, 1: manual, 2: auto
                NumRays                     "32768"
                NumBounces                  "64"
                IRDuration                  "1.0"
                AmbisonicsOrder             "1"
                ClusteringEnabled           "0"
                ClusteringCubemapResolution "16.0"
                ClusteringDepthThreshold    "10.0"
            }
            PathingDefaults
            {
                GridGenerationType "0" // 0: Automatic, Everywhere, 1: Automatic, Use Probe Generation Volume, 2: Manual
                FilterUsingVolumes "1" // Filter Using Probe Exclusion Volumes ( boolean )
                FilterUsingNavMesh "0" // Filter Using NavMesh
                GridSpacing        "3.0"
                HeightAboveFloor   "1.5"
                RebakeOption       "0" // 0: cleanup, 1: manual, 2: auto
                NumVisSamples      "1"
                ProbeVisRadius     "0"
                ProbeVisThreshold  "0.1"
                ProbeVisPathRange  "1000.0"
            }
            CustomDataDefaults
            {
                GridGenerationType         "0" // 0: Automatic, Everywhere, 1: Automatic, Use Probe Generation Volume, 2: Manual
                FilterUsingVolumes         "1" // Filter Using Probe Exclusion Volumes ( boolean )
                FilterUsingNavMesh         "1" // Filter Using NavMesh
                GridSpacing                "6"
                HeightAboveFloor           "1.5"
                RebakeOption               "0" // 0: cleanup, 1: manual, 2: auto
                BakeOcclusion              "0" // 0: Disabled, 1: Enabled
                BakeDimensions             "1" // 0: Disabled, 1: Enabled
                BakeMaterials              "0" // 0: Disabled, 1: Enabled
                OcclusionPathing           "1"
                OcclusionReflection        "0"
                OcclusionReflectionRays    "16384"
                OcclusionReflectionBounces "16"
                DimensionsOutsideThreshold "0.02"

            }
            ProbeGenerationVolumeDefaults
            {
                Spacing            "3.0"
                Height             "1.5"
                HeightSpacing      "12"
                UseForReverb       "0"
                UseForPathing      "0"
                UseForCustomData   "1"
                FilterUsingVolumes "1"
                FilterUsingNavMesh "1"
            }
        }
        SoundEventScripts
        {
            OmitMetadataAndLineText "1"
        }
        SoundStackScripts
        {
            CompileStacksStrict "1"
        }
        VisBuilder
        {
            MaxVisClusters                     "4096"
            PreMergeOpenSpaceDistanceThreshold "128.0"
            PreMergeOpenSpaceMaxDimension      "2048.0"
            PreMergeOpenSpaceMaxRatio          "8.0"
            PreMergeSmallRegionsSizeThreshold  "20.0"
        }

        VDataLocalization
        {
            GameOutputPath "resource/localization/citadel_vdata"
            TokenPrefix    "Citadel_VData_"
        }

        TextureCompiler
        {
            // CompressMinRatio        "95"
            // CompressMipsOnDisk      "1"
            // Compressor              "lz4"
            // PublicToolsDefaultMaxRes "2048"
            AllowNP2Textures           "1"
            AllowPanoramaMipGeneration "1"
        }
    }

    Source1Import
    {
        forcevtxfileupconvert "1"
    }

    WorldRenderer
    {

        //================= In Base WorldRender =================
        BindlessSceneObjectDesc      "CitadelBindlessDesc"
        EnvironmentMapCacheSizeTools "2"              // I believe this is the map cache size for the tools. We don't have the tools yet.                     [def: "300"]
        EnvironmentMapColorSpace     "linear"         // Colorspace. Options should be gamma or linear.                                                       [def: "linear"]
        EnvironmentMapFaceSize       "256"            //                                                                                                      [def: "256"]
        EnvironmentMapFormat         "BC6H"           // These values don't seem to be able to be changed but this should change the texture format           [def: "BC6H"]
        EnvironmentMapMipProcessor   "GGXCubeMapBlur" // this is the default
        EnvironmentMapPreviewFormat  "BC6H"           // ^                                                                                                    [def: "BC6H"]
        EnvironmentMapRenderSize     "1024"           // There does not seem to be any downside to messing with this value so it is currently in experimentation. [def: "1024"]
        EnvironmentMapUseCubeArray   "1"              // I don't know why disabling this would cause any problems
        EnvironmentMaps              "1"              //                                                                                                      [def: "1"]
        GrassCastsShadows            "0"              // whether or not grass casts shadows. We could care less                                               [def: "1"]


        //================= In The Worldrenderer.dll or cs2 =================
        // EnvironmentMapPreviewFormat  "RGBA16161616F" // This is from CS2 where it is also commented out. I would imagine setting it enables HDR of some format considering this is the integer HDR format, but I do not have an HDR monitor to test
        AggregateInstanceStream    "1"    // This from the dll, no default
        AggregateRTProxyDesc       "1"    // This from the dll, no default
        AggregateSceneObjectDesc   "1"    // This from the dll, no default
        AggregateVertexColorStream "1"    // This from the dll, no default
        EnvironmentMapCacheSize    "1024" //
        LPVEdgeBlending            "0"    // Don't apply the edge fade distance to LPV bounds, we don't blend LPVs in CS2 shaders

    }

    SceneSystem
    {
        //================= In Base SceneSystem =================
        CSMCascadeResolution                        "0"          // [def: "2048"]
        CubemapFog                                  "0"          // [def: "1"]
        DefaultShadowTextureHeight                  "0"          // [def: "6144"]
        DefaultShadowTextureWidth                   "0"          // [def: "6144"]
        DisableLateAllocatedTransformBuffer         "1"          // [def: "1"]
        DynamicShadowResolution                     "1"          // [def: "1"]
        FogCachedShadowAtlasHeight                  "0"          // [def: "2048"]
        FogCachedShadowAtlasWidth                   "0"          // [def: "2048"]
        FogCachedShadowTileSize                     "0"          // [def: "128"]
        FrameBufferCopyFormat                       "R11G11B10F" // [def: "R11G11B10F"]
        GpuLightBinner                              "1"          // [def: "1"]
        GpuLightBinnerSunLightFastPath              "1"          // [def: "1"]
        HDRFrameBuffer                              "0"          // [def: "1"]
        LayerBatchThresholdFullsort                 "200"        // [def: "20"]
        MinimumLateAllocatedVertexCacheBufferSizeMB "64"         // [def: "64"]
        NonTexturedGradientFog                      "0"          // [def: "1"]
        SunLightManagerCount                        "0"          // [def: "0"]
        SunLightManagerCountTools                   "0"          // [def: "0"]
        SunLightMaxCascadeSize                      "2"          // [def: "4"]
        SunLightShadowRenderMode                    "Depth"      // [def: "Depth"]
        Tonemapping                                 "0"          // [def: "0"]
        TransformTextureRowCount                    "1024"       // [def: "1024"]
        TransformTextureRowCountToolsMode           "6144"       // [def: "6144"]
        VolumetricFog                               "0"          // [def: "1"]

        //================= A String in SceneSystem.dll =================
        //CMTAtlasHeight                      "0"     // dll var, default unknown this will cause issues with ginnis' wall
        //CMTAtlasWidth                       "0"     // dll var, default unknown
        CharacterDecals                       "0"     // dll var, default unknown
        FogCachedShadowTileMaxFilterRadius    "0"     // dll var, default unknown
        DisableShadowFullSort                 "1"     // dll var, default unknown
        EnableAlphaTint                       "0"     // dll var, default unknown
        EnableSunlight                        "0"     // dll var, default unknown
        EnableViewModelSunlight               "0"     // dll var, default unknown
        GpuLightBinnerSupportViewModelCascade "0"     // dll var, default unknown
        HairShading                           "false" // dll var, default unknown
        GpuLightBinnerBinEnvMaps              "1"     // dll var, default unknown
        GpuLightBinnerBinLPVs                 "0"     // dll var, default unknown
        LightCookieAllocGranularity           "1"     // dll var, default unknown
        LightCookieMinAllocSize               "0"     // dll var, default unknown
        SupportsInstancedFade                 "0"     // dll var, default unknown
        ParticleBufferSize                    "512"   // dll var, default unknown
        PerVertexLighting                     "0"     // dll var, default unknown
        PointLightShadowsEnabled              "0"     // dll var, default unknown
        PointLightShadowsEnabled              "0"     // dll var, default unknown
        PunctualContactShadows                "0"     // dll var, default unknown
        SelfShadowStrength                    "0"     // dll var, default unknown
        ShadowAtlas                           "0"     // dll var, default unknown
        ShadowDepth                           "0"     // dll var, default unknown
        ShadowDepthBuffer                     "0"     // dll var, default unknown
        ShadowDepthBufferNoCmp                "0"     // dll var, default unknown
        ShadowmapMaxFilterRadius              "0"     // dll var, default unknown
        SparseShadowTrees                     "0"     // dll var, default unknown




        WellKnownLightCookies
        {
            blank      "materials/effects/lightcookies/blank.vtex"
            flashlight "materials/effects/lightcookies/flashlight.vtex"
        }

        ComputeShaderSkinning "1"
    }

    NavSystem
    {
        NavTileSize   "128.0"
        NavCellSize   "1.5"
        NavCellHeight "2.0"

        // Hull definitions live in scripts/nav_hulls.vdata
        // Preset definitions live in scripts/nav_hulls_presets.vdata
        NavHullsPreset "default"

        NavRegionMinSize              "8"
        NavRegionMergeSize            "20"
        NavEdgeMaxLen                 "1200"
        NavEdgeMaxError               "51.0"
        NavVertsPerPoly               "4"
        NavDetailSampleDistance       "120.0"
        NavDetailSampleMaxError       "2.0"
        NavSmallAreaOnEdgeRemovalSize "81.0"
    }

    AnimationSystem
    {
        DisableServerInterpCompensation "1"
        DisableAnimationScript          "1"
        ServerPoseRecipeHistorySize     "60"
        ClientPoseRecipeHistorySize     "60"

    }

    ModelDoc
    {
        models_gamedata "models_gamedata.fgd"
        features        "modelconfig;gamepreview;wireframe_backfaces;distancefield"
    }


    Particles
    {
        //================= In Base Particles =================
        BindlessParticleShader               "1"
        EnableParticleShaderFeatureBranching "1"
        Features                             "non_homogenous_forward_layer_only"
        Float16HDRBackBuffer                 "1"
        PET_SupportFadingOpaqueModels        "1"

        //================= In Particles.dll =================
        EnableMixedResolution         "1" // dll var, default unknown
        MPropertyFlattenIntoParentRow "1"
        ParticleTraceOffsetOnlyHit    "1"
        ParticlesFoggedByDefault      "0"
        PerVertexLighting             "0"
        PostSimulate                  "0"
    }

    Physics
    {
        EnableWorldCompounds "1"
    }

    ConVars
    {

        //      If you would like to donate as a means of showing thanks I have a kofi.     \\
        //      https://ko-fi.com/sqooky                                                    \\

        // -------- Performance Config! Sqooky's.gi / OptimizationLock -- ver. 3.4 -------- \\
        // The github is here https://github.com/Sqooky/OptimizationLock  \\
        // In-Depth Tutorial: https://www.youtube.com/watch?v=zC3wBYY98vU \\
        // The gamebanana:https://gamebanana.com/mods/656341 (it's usually behind, please check the github) \\

        // IF YOU ARE MODIFYING A COMMAND AND NOTHING IS CHANGING SEE BELOW
        //this_is_an_example_comment "true"     // This command is commented out, represented by the // at the beginning of the line. Editing it will not do anything. To mess with it remove the //

        // ================ Preferences ================
        // --- 0. IMPORTANT ---
        // mm_prefer_solo_only                   "true"  // If I understand what this command does, this command controls whether or not you are matched with other solo queue players. For me this dramatically improved the solo queue performance but I am not sure if that is placebo. [def: "false"]
        citadel_camera_use_vmdl_flatten_vertical "true"  // Setting this command to false should improve responsiveness of mouse input but makes Rem, Venator, AND ESPICIALLY RAT KING's cameras move downwards when aiming down scope. Not exactly a dealbreaker but might be undesirable for some.                                                                                                                                      [def: "true"]
        citadel_portrait_world_renderer_off      "false" // Disables character models in shop and endgame screen                                            [def: "false"]
        citadel_trooper_glow_disabled            "1"     // 1 = Disable friendly/enemy minion glow.                                                         [def: "0"]
        cl_phys_enabled                          "true"  // Disables all physics. This means ragdolls just maintain the last pose and boxes don't fall over [def: "true"]
        lb_enable_dynamic_lights                 "true"  // SET THIS TO TRUE TO MAKE HERO PORTRAITS HAVE COLOR IN THE SHOP AND ENDGAME *Disables dynamic lights eg. walker, shop, tp, character abilities etc. (hero silhouettes go dark in menus as a side effect) [def: "1"]
        r_citadel_enable_pano_world_blur         "true"  // This command disables the blur in the shop and improves the performance of the shop DRAMATICALLY however it can cause visual issues with the pause menu on nvidia systems running vulkan. Please experiment. [def: "true"]
        r_particle_explicit_fetch                "false" // [def: "false"]        // I believe this improves performance but will make soul orbs a bit difficult to see
        r_particle_max_size_cull                 "900"   // [def: "1200"] // Particle systems larger than this in every dimension skip culling to save CPU.  They will be drawn anyway. // So particle culling is handled by the CPU in deadlock, if you have GPU overhead to spare, consider lowering this value.
        r_size_cull_threshold                    "0.9"   // This will control the distance trooper healthbars and boxes stop rendering *Culls small objects sooner based on screen size threshold (higher = more culling). [def: "0.8"]
        sc_screen_size_lod_scale_override        "0.55"  // Controls LOD scale. Lower values will make sinners and playermodels look worse "my sinner's lights are little triangles" [def: "-1"]
        steam_inputhandler_enabled               "true"  // This disables controller support when set to false. Setting to false should improve performance if you're not on a steam deck, but some people are, and I don't want an influx of "why no work with controller"  [def: "true"]
        // citadel_in_world_item_panel_dpi        "0"    // This controls the quality of the text above soul pickups, so boxes, golden statues, and soul orbs. Higher values mean better quality, lower means worse. [def: "2"]

        // --- Render Distance ---
        r_farz       "7000" // This controls the far clipping plane, ie building/player popin   [def: "-1"]
        r_mapextents "7000" // Far clipping plane, this will make buildings pop in and out      [def: "16384"]

        // --- Health Bar Minor Tweaks ---
        // citadel_unit_status_delta_decay_delay   "0"   // The delay between doing damage and havin the yellow damage indicator appear [def: "0.5"]
        // citadel_unit_status_delta_decay_rate    "10"  // How quickly the yellow "you're dealing damage" indicator fades [def: "0.5"]
        // citadel_unit_status_recent_damage_time  "inf" // how long to show someone's numerical health value when you shoot them. Inf means infinite, but will cause the healthbar to jiggle/shake forever. [def: "0.25"]



        // --- 1. Outlines ---
        citadel_boss_glow_disabled                             "1"    // Disables boss and walker glow/highlight effect.                  [def: "0]
        citadel_damage_offscreen_indicator_disabled            "true" // The little trooper portraits that show up behind walls.          [def: "true"]
        citadel_unit_status_allies_see_thru_walls              "true" // Do you want to see allied player outlines through walls          [def: "true"]
        citadel_unit_status_allies_see_thru_walls_max_distance "40"   // How far to make allied players' unit status show through walls.  [def: "0"] (0 means no limit)
        citadel_unit_status_dpi                                "10"   // This increases the size of the health bar. Unfortunately I think this lowers performance. A shame. [def: "10"]

        // --- 2. Field of View ---
        // r_aspectratio changes the zoom of the camera which in turn doesn't make the punch zoom in as jarring, but the command is not as intuitive to set precisely
        r_aspectratio "2.9" // 1.75=80fov | 2.15=90fov | 2.49=100fov (every .15 interval = 5 fov).

        // --- 3. HUD ---
        citadel_unit_status_stamina_low_pips            "7"     // below this threshold stamina is permanantly visble [def: "3"]
        citadel_damage_report_enable                    "1"     // Enables/Disables incoming/outgoing damage tab (tuning this off is very questionable but okay). [def: "1"]
        citadel_damage_text_batching_window_ability     "1000"  // How long to wait until batching damage text.
        citadel_distance_mouse_move_for_minimap_drawing "1"     // this command makes drawing on the minimap more precise so you can actually doodle on it :D makes me happy [def: "15"]
        citadel_hideout_ball_show_juggle_count          "1"     // Shows a fun juggle count minigame for hideout ball.              [def: "0"]
        citadel_hideout_ball_show_juggle_fx             "1"     // Shows juggle visual FX for hideout ball minigame.                [def: "0"]
        citadel_hud_objective_health_debug_show_midboss "false" // This makes midboss' health bar visible whenever it's able to be rendered. I like it, you might not [def: "false"]
        citadel_hud_objective_health_enabled            "2"     // 0=Off, 1=Shrines, 2=T1/T2, 3=Barracks.                           [def: "2"]
        citadel_unit_status_old_update_rate             "15"    // How frequently health bars can update. Lowering it should improve performance    [def: "30"]
        citadel_unit_status_single_bar_mode             "false" // This makes the v2 halth bar be one bar as opposed to multiple, which I find more easily readable [def: "false"]
        citadel_unit_status_use_new                     "true"  // This uses new Health Bar, to use old Health Bar change "true" to "false".                    [def: "false"]
        citadel_unit_status_use_v2                      "0"     // Set to 1 to enable the new health bar that allows you to  see enemy stamina.                 [def: "0"]
        citadel_unit_status_use_v2_for_nonplayers       "0"     // Set to 1 to enable the new health bar but for troopers, objs, and camps.                     [def: "0"]
        v8_maximum_heap_size_mb                         "1024"  // This should double the amount of cache used by the ingame hud, so less stutter! Yay!
        panorama_comp_layer_lru_lifetime                "4"     // This should keep panorama caches loaded for longer so the game can use them more frequently. [def: "1"]
        // panorama_render_target_cache_max_size        "134217728" // This should increase the panorama cache size by 4x, needs more testing                       [def: "31457280"]

        // --- 3.1 Uncomment These Commands if You Want to Have The Chat Wheel Not Show Up When Pinging ---
        // citadel_show_chat_wheel_angle_threshold         "30"    // (degrees) Increase this to change how much you have to move your camera angle to make the Chat Wheel instantly visible while holding Ping. [def: "16"]
        // citadel_show_chat_wheel_time                    "15"    //
        // citadel_auto_ping_window                        "0"     //
        // citadel_ping_wheel_activation_radius            "1"     //

        // --- 4. Lighting & Shadows ---
        lb_enable_baked_shadows     "false" // *Disables baked shadows (game looks bright if this is on while stationary lights = 1). [def: "1"]
        lb_enable_stationary_lights "false" // *Disables stationary lights (map looks flatter but more performant).         [def: "1"]


        // --- 5. FPS Caps & Minimized Throttling ---
        engine_low_latency_sleep_after_client_tick "false" // When r_low_latency is enabled, this moves the low latency sleep on tick frames to happen after client simulation. [def: "false"]
        panorama_max_fps                           "30"    // Menu FPS.                                                        [def: "120"]
        panorama_max_overlay_fps                   "30"    // Fps In the settings/esc menu.                                    [def: "60"]

        // --- 6. Camera Tweaks ---
        citadel_melee_shake_duration "0"
        // citadel_camera_listening_offset    "-1"   // To be completely honest I have no idea but I want to test this.  [def: "0"]
        citadel_camera_soft_collision_angle         "75"    //                                                                  [def: "75"]
        citadel_camera_use_vmdl_flatten_horizontal  "false" // From my understanding of how these commands work, they slightly smooth camera inputs. This should make the camera more responsive?   [def: "true"]
        citadel_camera_wobble_disable               "true"  // I believe this disables the camera wobble when heavy melee'd or talking walker/guardian damage. I like it
        citadel_melee_shake_amplitude               "0"     // I believe this properly disables the camera shake on heavy melee                 [def: 0.55]
        engine_accurate_input_processing_delta_time "true"  // When true, elapsed time given to the input processing will be the time elapsed since the last input processing. This is only relevant when input is processed multiple times per frame ( i.e. multiple ticks per frame) [def: false]
        r_citadel_clip_sphere_min_opacity           "0"     // Removes the blur from the pinhole camera                         [def: "40"]

        // --- 7. Camera Responsivity Tweaks ---
        cam_idealdelta                          "0"
        cam_ideallag                            "0"
        citadel_camera_height                   "0"
        citadel_camera_height_ceiling_distance  "0"
        citadel_camera_listening_offset         "-1"
        citadel_camera_pitch_default            "0"
        citadel_camera_see_distance_max         "7000"
        citadel_shoot_forward_offset            "0"
        citadel_stuck_camera_trace_extra_length "0"
        citadel_tightcamera_alternative         "1"
        nav_edit_use_camera                     "0"
        rpg_camera_yaw                          "0"

        // --- 8. Texture Quality ---
        r_texture_budget_threshold     "0.7" // Reduce texture memory pool size when this percentage of the budget is full. [def: "0.8"]
        r_texture_budget_update_period "0.5" // Time (in seconds) between updating texture memory budget.        [def: "0.1"]
        r_texture_stream_mip_bias      "3"   // Worth adjusting, practically how good your textures will look.   [def: "1"]
        r_texturefilteringquality      "0"   // Texture filtering, has very low fps impact. 0: Bilinear, 1: Trilinear, 2: Aniso 2x, 3: Aniso 4x, 4: Aniso 8x, 5: Aniso 16x

        // ================ IMPORTANT ================
        thread_pool_option "2" // If I understand correctly, this should be how threads are handled relative to the game, but there isn't a clear indication of what changing it even does. For now I have it at -1 which is the default, but your mileage may vary. [def: "-1"]
        // 1 gives "GlobalThreadPoolMode" "efficiency"
        // 2 removes it from boot.vcfg
        // 3 gives "GlobalThreadPoolMode" "undifferentiated"
        // 4 gives "GlobalThreadPoolMode" "auto_threads"
        // 5 removes it from boot.vcfg
        // 6 gives "GlobalThreadPoolMode" ""max_threads"
        // 7-10 removes it from boot.vcfg

        // -1 Default
        // -2 removes it from boot.vcfg


        // ================= UI ================
        closecaption               "false" // I assume this does what it says on the tin                       [def: "false"]
        panorama_allow_transitions "false" // Turns off UI anim (shop,etc)                                     [def: "1"]
        panorama_disable_blur      "true"  // Disables UI blur effects in the UI.                              [def: "false"]
        //panorama_disable_box_shadow "true"  // Disables UI box shadows in the UI (less GPU/UI cost).            [def: "false"]
        panorama_panel_occlusion   "true" // According to John Valve this is an optimization feature that stops rendering of panels underneath the top level. [def: "true"]
        r_dashboard_render_quality "1"    // Sets dashboard/UI render quality (lower = cheaper UI rendering). [def: "1"]

        // ================ Shadows ================
        lb_barnlight_shadowmap_scale             "0"    // Scale for computed barnlight shadowmap size (lower = cheaper).   [def: "1"]
        lb_csm_cascade_size_override             "1"    // Enables overriding CSM cascade sizing rules (forces engine to use override values). [def: "-1"]
        lb_csm_draw_alpha_tested                 "0"    // Prevents alpha-tested geometry from being included in CSM passes (cheaper, possible missing leaf/fence shadows). [def: "1"]
        lb_csm_draw_translucent                  "0"    // Prevents translucent objects from rendering into CSM (cheaper, fewer shadow details). [def: "1"]
        lb_csm_override_staticgeo_cascades       "true" // Override Cascades that will render static objects with lb_csm_override_staticgeo_cascades_value. [def: "false"]
        lb_csm_override_staticgeo_cascades_value "true" // If lb_csm_override_staticgeo_cascades, override value used to determine which cascades render static objects [def: "false"]
        lb_dynamic_shadow_resolution_base        "16"   // Base resolution for dynamic shadows (lower = cheaper).           [def: "1024"]
        lb_enable_shadow_casting                 "0"    // Disables baked shadows I believe                                 [def: "1"]
        lb_ssss_samples                          "0"    // Subsurface sample count                                          [def: "11"]
        lb_sun_csm_size_cull_threshold_texels    "60"   // Culls tiny CSM contributions below a texel threshold (performance).              [def: "10"]
        r_citadel_shadow_caching                 "true" // We disable all shadows so this shouldn't be needed               [def: "true"]
        r_citadel_shadow_quality                 "0"    // Deadlock/Citadel shadow quality level (0 = lowest).              [def: "2"]
        r_size_cull_threshold_shadow             "2.4"  // Threshold of shadow map size percentage below which objects get culled (higher = cull more to save shadow cost). [def: "0.2"]
        sparseshadowtree_disable_for_viewmodel   "1"    // Disable SST generation and runtime for viewmodel (use original CSM rendering).   [def: "1"]
        sparseshadowtree_enable_rendering        "0"    // Enables Sparse Shadow Tree, rendering static geometry into shadow cascades.      [def: "0"]

        // ================ Lighting ================
        cl_retire_low_priority_lights               "1"    // Replaces/drops low-priority dynamic lights when higher-priority lights are present (helps cap dlight clutter/cost). [def: "0"]
        mat_async_shader_load                       "1"    // I have no reason to believe the name doesn't match the function  [def: "0"]
        mat_max_lighting_complexity                 "0"    // Doesn't seem to do anything but throwing it in for posterity.    [def: "8"]
        r_citadel_ssao_quality                      "0"    // SSAO quality level (0 = lowest/off-ish).                         [def: "3"]
        r_citadel_ssao_thin_occluder_compensation   "0"    // Disables special handling for thin occluders in SSAO (cheaper).  [def: "0.5"]
        r_citadel_sun_shadow_slope_scale_depth_bias "0"    // \\                                                               [def: "3.54"]
        r_distancefield_enable                      "1"    // Disables/ Enables distance-field system (used by some lighting/shadowing/occlusion features). [def: "1"]
        r_lightmap_bicubic_filtering                "1"    // Enables bicubic filtering on lightmaps.                          [def: "1"]
        r_lightmap_size                             "2048" // Maximum lightmap resolution..                                    [def: "65536"]
        r_lightmap_size_directional_irradiance      "0"    // Sets directional irradiance lightmap data size (lower = less detail) (-1 = uses value of r_lightmap_size ). [def: "-1"]
        r_multiscattering                           "1"    // Enables multi-scattering lighting approximation.                 [def: "1"]
        r_rendersun                                 "0"    // Disables sun lighting.                                           [def: "1"]
        r_ssao                                      "0"    // Disables screen-space ambient occlusion.                         [def: "1"]
        r_ssao_strength                             "0"    // AO strength multiplier (0 = no AO contribution).                 [def: "1.2"]

        // ================ Ragdolls ================
        cl_disable_ragdolls "0" // Keep set to 0 - enabling this (disabling ragdolls) can cause issue with doorman's ultimate. [def: "0"]
        cl_ragdoll_limit    "0" // Limit of how many ragdolls can be rendered at once.              [def: "-1"]

        // ================ Models ================
        cl_fasttempentcollision         "1000" // Limits/controls fast collision processing for temporary entities (impacts/tracers/etc.); higher usually = more work. [def: "5"]
        cloth_sim_on_tick               "0"    // Update the cloth simulation every tick                           [def: "1"]
        enable_boneflex                 "0"    // Disables bone flexes (procedural facial/mesh flex drivers).      [def: "1"]
        ik_fabrik_align_chain           "1"    // Disables FABRIK chain alignment in IK (cheaper).                 [def: "1"]
        ik_final_fixup_enable           "0"    // Disables final IK fixup pass (cheaper animations, potentially less accurate). [def: "1"]
        props_break_max_pieces_perframe "0"    // Makes boxes and troopers break into a single piece               [def: "16"]  // Say thank you to jasper that this can be set to 0 now <3

        // ================ Visual Clarity ================
        cl_show_splashes                     "0"     // Disables splash effects (water/impact splashes).                 [def: "1"]
        mat_colorcorrection                  "1"     // Disables/ Enables color correction (game looks less vibrant when off).   [def: "1"]
        r_character_decal_resolution         "4"     // Resolution of character decal textures.                          [def: "1024"]
        r_depth_of_field                     "0"     // Disables depth of field.                                         [def: "1"]
        r_effects_bloom                      "0"     // Disables effects bloom.                                          [def: "1"]
        r_post_bloom                         "0"     // Disables post-process bloom.                                     [def: "1"]
        sc_clutter_enable                    "false" // Disables clutter props, improves visibility & FPS.               [def: "true"]
        violence_ablood                      "0"     // Disables alien/other blood effects.                              [def: "1"]
        violence_agibs                       "0"     // Disables alien/other gibs.                                       [def: "1"]
        violence_hblood                      "0"     // Disables human blood effects.                                    [def: "1"]
        violence_hgibs                       "0"     // Disables human gibs.                                             [def: "1"]
        volume_fog_intermediate_textures_hdr "false" // See below                                                        [def: "true"]
        // Based on the name I would assume that this changes the color depth of the fog. Since the majority of users don't have hdr panels or want bloom, setting this to false is beneficial

        // ================ Network ================
        // Don't mess with network commands yet
        // cl_async_usercmd_send "true" // Makes the client send updates asyncronously I belive. Seems to smooth over network jank, although you will need to remove it from lower down in the gameinfo.gi [def: "false"]
        // cl_updaterate      "128"  // Client snapshot update rate requested from the server (higher = more frequent updates).      [def: "128"]
        // cl_interp          "0.01" // Client-side interpolation time (smoothing delay) for rendering other players/entities.       [def: 0]
        // cl_interp_ratio    "1"    // Multiplier that affects interpolation time (often cl_interp_ratio / cl_updaterate).              [def: "0"]
        // cl_smoothtime      "0.01" // Smooth client's view after prediction error over this many seconds (Lower = snappier but more abrupt, higher = smoother but floaty). [def: "0.2"]
        // cl_resend          "15"   // Delay in seconds between reconnect attempts (higher = less frequent, helps avoid kicks/timeouts on unstable connections). [def: "0.5"]

        // ================ System Related ================
        // Chances are these don't matter so you can ignore them
        // battery_saver         "0"     // Disables battery saver mode (no automatic throttling).                   [def: "0"]
        // cpu_level             "1"     // CPU level.                                                               [def: "2"]
        // enable_priority_boost "true"  //
        // gpu_mem_level         "1"     // GPU Memory level.                                                        [def: "2"]

        // ================ Particles ================
        cl_particle_sim_fallback_base_multiplier "100" // How aggressive the switch to fallbacks will be depending on how far over the cl_particle_sim_fallback_threshold_ms the sim time is.  Higher numbers are more aggressive. [def: "5"]
        cl_particle_sim_fallback_threshold_ms    "1"   // Amount of simulation time that can elapse before new systems start falling back to cheaper versions [def: "6"]
        cl_particle_fallback_multiplier          "10"  // Multiplier for falling back to cheaper effects under load.       [def: "0"]
        cl_particle_fallback_base                "5"   // Base for falling back to cheaper effects under load.             [def: "0"]
        // r_particle_mixed_resolution_viewstart    "16"     // I don't know if this does anything but I didn't notice anything terrible out the gate and lowering particle resolution can't hurt [def: "500"]
        //r_particle_timescale                  "1"      // Speeds up particle simulation, thus making them end sooner, however this causes visual desyncs, most notably with big effects that last a while such as infernus ult. Please tweak this to what you are comfortable with. [def: "1"]
        cl_aggregate_particles                   "true"    // Doesn't seem to cause any issues but a benchmark proper should be conducted [def: "false"]
        cl_particle_batch_mode                   "1"       // Has a range of 1 or 2, 2 will make celeste's auto rebound look weird and 0 will make them not batch [def: "1"]
        r_citadel_screenspace_particles_full_res "true"    // Render screen space particles at full resolution. This could introduce readability issues but should be fine. [def: "true"]
        r_draw_particle_children_with_parents    "1"       // I believe this handles the drawing of little visual flourish particles. [def: "-1"]
        r_limit_particle_job_duration            "true"    // Seems to help with particle clutter, although I am not sure.             [def: "false"]
        r_particle_allowprerender                "true"    // I imagine it renders particles prematurely, which we do not care for.    [def: "true"]
        r_particle_batch_collections             "true"    // Batches collections of particles, typically batch rendering is faster so this is set to true. [def: "false"]
        r_particle_fixedrandomseeds              "true"    // I need to properly test this, but I'm pretty sure that setting this to true marginally increases performance. That being said it does make flames from paige 1 always appear on the left, so your call ig [def: "false"]
        r_particle_max_texture_layers            "4"       // Anything below 4 will make infernus afterburn, paige fire, and drifter's passive look very weird and blocky [def: "-1"]
        r_particle_min_timestep                  "0.00241" // Minimum amount of time for particles to update. Higher values will have particles stutter, while lower values could negatively impact performance. [def: "0"]
        r_particle_model_per_thread_count        "64"      // I believe it is how many particle models a thread is allowed to handle.  [def: "32"]
        r_particle_skip_postsim                  "true"    // Not entirely sure what it does, going off of the name I'd imagine it skips the post simulation, this is a testvar [def: "false"]
        r_physics_particle_op_spawn_scale        "0"       // Prevents physics-based particle spawns.                          [def: "1"]
        r_update_particles_on_render_only_frames "true"    // This does what it says on the tin, should save more performance the lower fps gets   [def: "false"]
        r_world_wind_strength                    "0"       // Disables wind effects, cosmetic only.                            [def: "40"]

        // ================ Lod & Culling ================
        // sc_instanced_mesh_size_cull_bias       "10"    // Bias for size culling of instanced meshes                        [def: "1.5"]
        //mat_viewportscale                       "0.01"  // Scale down the main viewport I belive this gets overwritten by video.txt [def: "1"]
        //sc_instanced_mesh_lod_bias              "0.001"  // Bias for LOD selection of instanced mesh                         [def: "1.25"]
        //sc_instanced_mesh_lod_bias_shadow       "0.001"  // Bias for LOD selection of instanced meshes in shadowmaps         [def: "1.75"]
        phys_cull_internal_mesh_contacts        "true"  // Don't simulate the bones inside of a mesh.                       [def: "false"]
        sc_aggregate_bvh_threshold              "256"   // Not fully sure what these do. Don't change them.                 [def: "128"]
        sc_allow_dithered_lod                   "false" // Pretty sure this just turns dithering off for when switching between lods. Isn't a big deal [def: "true"]
        sc_fade_distance_scale_override         "100"   // Distance objects fade in and out                                 [def: "-1"]
        sc_instanced_mesh_motion_vectors        "0"     // Set 1 if you use motion blur                                     [def: "1"]
        sc_instanced_mesh_size_cull_bias_shadow "10"    // Bias for size culling instanced meshes in shadowmaps             [def: "2"]
        sc_layer_batch_threshold                "256"   // Not fully sure what these do. Don't change them.                 [default: "128"]
        sc_layer_batch_threshold_fullsort       "120"   // Not sure what these do. Jasper said to leave them at default     [def: "80"]

        // ================ Rendering Stuff ================
        // sc_aggregate_indirect_draw_compaction_threshold "1"     // Need to test                                                   [def: "8"]
        //r_force_zprepass               "0"     // 0: Force z prepass off. 1: Force on. -1: Don't force             [def: "-1"] // With my understanding of how zprepasses work this should reduce cpu usage if set to zero, but that's under the assumption that valve's implementation isn't properly optimized. Please play with this. Your mileage may vary.
        //sc_aggregate_render_mesh_shader                    "true" // Using mesh shaders if available instead of drawcalls. Should be cheaper [def: "true"]
        //sc_aggregate_rtproxy_instanced_geo                 "false" //
        //sc_aggregate_rtproxy_unique_geo                    "false" //
        citadel_video_preset          "9"     //                         [def: "3"]
        r_citadel_gpu_culling         "true"  // The game barely uses the gpu so this is a win                    [def: "true"]
        r_vma_defrag_algorithm        "0"     // Should speed up vulkan defragging, which could increase performance if you're  getting bad performance the longer a match goes on [def: "1"]
        rtx_dynamic_blas              "false" // Don't think that raytracing is used, but I'm making sure         [def: "true"]
        rtx_dynamic_blas_caching      "true"  //                                                                  [def: "true"]
        rtx_force_default_hitgroup    "true"  //                                                                  [def: "false"]
        rtx_texture_resolution        "64"    //                                                                  [def: "true"]
        sc_allow_dithered_lod         "false" // This should dither the lod to make it less obtrusive             [def: "true"]
        sc_instanced_mesh_opaque_fade "false" // Fade meshes? NAH                                                 [def: "true"]


        // ================ Sound ================
        snd_steamaudio_max_occlusion_samples "32"  // max number of samples for audio reverb [def: "64"]
        snd_steamaudio_num_diffuse_samples   "512" // The number of directions considered for ray bounce by the game's audio [def: "2048"]


        // ================ Misc ================
        // Most of the commands here I am unsure of the effects/efficacy of. They are included for posterity.
        //r_low_latency                                     "0"      // This acts as the convar which enables low latency, hardware dependent    [def: "1"]
        //sc_force_materials_batchable                      "true"   // I would imagine this functions as the variable is named.         [def: "false"]
        cc_captiontrace                                   "0" // Show missing closecaptions (0 = no, 1 = devconsole, 2 = show in hud) [def: "1"]
        citadel_bullet_shot_offset_fade_time              "0"
        citadel_show_survey                               "true"
        citadel_test_ranked_summary                       "true"
        cl_batch_entity_list_ops_during_latch             "true"  // Batch entity list adds / removes while latching interpolated variables to avoid mutex contention.        [def: "false"]
        cl_enable_eye_occlusion                           "false" // [def: "true"]
        cl_interp_parallel                                "true"  // Run interpolation in parallel for entities with no children.     [def: "false"]
        cl_modifier_parallel_gather_status_effect_updates "false" // Not sure                                                         [def: "false"]
        cl_phys_assume_fixed_tick_interval                "true"  // Assume the client uses a fixed tickrate like the server (which may not always be true)                   [def: "true"]
        csm_viewmodel_farz                                "1"     //
        csm_viewmodel_max_shadow_dist                     "1"     //
        csm_viewmodel_max_visible_dist                    "1"     //
        csm_viewmodel_nearz                               "512"   //
        debug_draw_enable                                 "false" //
        default_fov                                       "0"     //
        engine_max_ticks_to_simulate                      "2"     // Max number of ticks to simulate per frame, after which simulation will start to slow down compared to real time. [def: "-1"]
        r_async_compute_fog                               "true"  // Just whether to asyncroniously render fog                        [def: "false"]
        r_citadel_depth_prepass_dynamic_objects           "false" // Should be not prepassing entities that move                      [def: "true"]
        r_citadel_glow_health_bar_debug                   "false" // This seems to be a command controlling the rendering of a debug tool. Seeing as its inclusion doesn't benefit us I have disabled it [def: "true"]
        r_citadel_gpu_preview_denoise_passes              "0"     // [def: "3"]
        r_drawropes                                       "false" // [def: "true"]
        r_drawtracers_firstperson                         "false" // [def: "true"]
        r_drawviewmodel                                   "false" // [def: "true"]
        r_enable_rigid_animation                          "false" // [def: "true"]
        r_hair_ao                                         "0"     // Disables hair ambient occlusion/shading pass.                    [def: "1"]
        r_max_portal_render_targets                       "2"     // Maxium number of Doorman doors to allow rendering.               [def: "0"] // This will cause visual bugs when set to 1, either set it to 2 or 0 to disable them.
        r_particle_model_new                              "false" // Jasper stated that these variables aren't used by deadlock so I'm disabling them to be safe :steam_happy:    [def: "false"]
        r_particle_model_new8                             "false" // Jasper stated that these variables aren't used by deadlock so I'm disabling them to be safe :steam_happy:    [def: "true"]
        r_particle_newinput                               "true"  //
        r_pixelvisibility_partial                         "false" // As far as I am aware this disables the pixel visibility system which should reduce visual fidelity but saves you from drawing a ray (I THINK) [def: "true"]
        r_render_hair                                     "false" // [def: "true"]
        r_renderdoc_auto_shader_pdbs                      "false" // Automatically generate shader debug info on capture.             [def: "true"]
        r_skip_precache_validation_check                  "true"  // I believe this checks to see if things are properly cached in a debug context, which we shouldn't need   [def: "false"]
        r_strip_invisible_during_sceneobject_update       "1"     // idk ngl    [def: "false"]
        sparseshadowtree_leaf_precision_viewmodel         "0"     //            [def: "0.0005"]
        viewmodel_fov                                     "0"     //            [def: "54"]

        // ================ Grass ================
        r_grass_end_fade   "0" // When to cull grass when far                                      [def: "300"]
        r_grass_quality    "0" // Quality of the grass                                             [def: "2"]
        r_grass_start_fade "0" // When to cull grass when it's close I think                       [def: "0"]

        // ================ Creep AI ================
        cl_simulate_dormant_entities "false" // Based on the name I would imagine it does what it says.          [def: "true"]

        // ================ Audio ================
        audio_enable_vmix_mastering              "false" // Whether the engine uses vmix to master the audio, might be a dev command [def: "true"]
        snd_mixahead                             "0.05"  // Adds some latency that shouldn't be percivable to save cpu       [def: "0.001"]
        snd_occlusion_bounces                    "0"     // Limits audio occlusion to save cpu                               [def: "1"]
        snd_occlusion_rays                       "0"     // Occlusion bounces, this effectively disables them.               [def: "4"]
        snd_soundmixer_version                   "2"     // [def: "2"]
        snd_steamaudio_reverb_order_rendering    "0"     // The amount of directional detail in the rendered audio by Steam Audio. [def: "0"]
        snd_ui_positional                        "false" // Disables positional audio to save cpu                            [def: "true"]
        snd_steamaudio_num_threads               "6"     // Audio thread count                                               [def: "4"]
        audio_enable_spawn_mask_mix_layer        "false" // Disabling these should help with performance, Yay! [def: "true"]
        snd_boxverb_simd                         "false" // Disabling these should help with performance, Yay! [def: "true"]
        snd_enable_subgraph_corenull_passthrough "false" // Disabling these should help with performance, Yay! [def: "true"]

        // README This ^ probably depends on how good your cpu is, the better it is the more threads you can allow

        // ================ Csm Shadows. ================
        // According to jasper these shouldn't do anything, but I'm keeping them because they seemed to provide a performance increase with them disabled
        // I need to do benchmarks of the config with and without these commands, however I am LAZY
        csm_cascade0_override_dist               "0"     // All of these commands should reduce shadow quality.
        csm_cascade1_override_dist               "0"     // All of these commands should reduce shadow quality.
        csm_cascade2_override_dist               "0"     // All of these commands should reduce shadow quality.
        csm_cascade3_override_dist               "0"     // All of these commands should reduce shadow quality.
        csm_max_dist_between_caster_and_receiver "0"     // All of these commands should reduce shadow quality.
        csm_max_num_cascades_override            "0"     // All of these commands should reduce shadow quality.
        csm_max_visible_dist                     "0"     // All of these commands should reduce shadow quality.
        csm_res_override_0                       "1"     // All of these commands should reduce shadow quality.
        csm_res_override_1                       "1"     // All of these commands should reduce shadow quality.
        csm_res_override_2                       "1"     // All of these commands should reduce shadow quality.
        csm_res_override_3                       "1"     // All of these commands should reduce shadow quality.
        csm_viewmodel_shadows                    "false" // All of these commands should reduce shadow quality.

        // ================ Disabling Inverse Kinematics ================
        // This segment just disables everything pertaining to inverse kinematics. As far as I can tell it doesn't produce animation artifacts and marginally improves performance
        enable_boneflex                   "false"
        ik_constraints_enabled            "false"
        ik_debug_dogleg3bone_enabled      "false"
        ik_debug_fabrik_backwards_enabled "false"
        ik_debug_fabrik_forwards_enabled  "false"
        ik_enable                         "false"
        ik_fabrik_backwards_enabled       "false"
        ik_fabrik_forwards_enabled        "false"
        ik_final_fixup_enable             "false"
        ik_planetilt_enable               "false"

        // ================ Disabling Animgraph Stuff ================
        // Don't think these impact visuals
        animgraph_footlock_calculate_tilt       "false"
        animgraph_footlock_enabled              "false"
        animgraph_footlock_ground_roll          "false"
        animgraph_footlock_hip_offset_enable    "false"
        animgraph_footlock_ik_enable            "false"
        animgraph_footlock_trace_ground_enabled "false"
        animgraph_footlock_use_hip_shift        "false"
        animgraph_slowdownonslopes_enabled      "false"


        // ================ Convars You Shouldn't/Can't Mess With But I Want to Maintain the Documentation ================
        // ai_disable                               "1"             // Both of these commands disable creep animations which means that neutrals and guardians won't move [def: "0"]
        // ai_disabled                              "1"             // [def: "0"]
        // cam_idealdist                            "0"
        // citadel_camera_dist                      "0"
        // citadel_camera_height_approach_speed     "0"             // This makes the camera go all black when set to zero. Cool!
        // citadel_camera_hero_fov                  "106"           // The field of view angle of the camera when following a hero.     [def: "90"] //
        // citadel_crosshair_hit_marker_duration    "0.00001"       // Removes the hitmarker when shooting people.                      [def: "0.1"]
        // citadel_damage_text_show_effectiveness   "0"             // Shows extra “effectiveness” info in damage text (e.g., resist/weakness style feedback). As far as I can tell this is unfinished right now [def: "0"]
        // citadel_first_person                     "true"          // Puts you in first person, messes up character rendering
        // citadel_outer_radius_scaler              "0"             // For some reason setting this to zero disables ping wheel input.
        // citadel_roster_select_force_enable_priority_token "true" // Causes a crash but does what you think it would.
        // citadel_rp_show_dev_messages             "true"          // Rich presence debug messages. Spams console with "x is doing y in the hideout"
        // citadel_weapon_spread_debug              true            // Doesn't seem to do anything.
        // cl_input_enable_raw_keyboard             "1"             // Surprisingly this can cause issues with holding keys after upgrading with alt. [def: "0"]
        // cl_particle_max_count                    "1500"          // Maximum allowed particles. Setting it too low will cause issues. With flooding from the console.  [def: "0"]
        // cl_particle_sim_fallback_threshold_ms    "0.3"           // Amount of simulation time that can elapse before new systems start falling back to cheaper versions [def: "6"]
        // cl_phys_enabled                          "false"         // You can disable physics and might see an improvement in framerate, however a lot will be buggy.   [def: "true"]
        // cl_skip_update_animations                "true"          // Setting this to  true causes models outside of the game world to a-pose. looks cute.
        // gpu_level                                "1"             // GPU level literally doesn't matter, gets set to 2 in the engine
        // instant_replay                           "true"          // enables/disables the replay system. If set to false players will be in the idle animation in replays [def: "true"]
        // lb_enable_envmaps                        "false"         // This makes all characters black
        // movement_stats_debug_draw                "true"          // Doesn't seem to do anything
        // panorama_disable_descendant_filtering    "true"          // Causes issues with the hud
        // panorama_disable_draw_fancy_quad         "true"          // Causes issues with the hud
        // panorama_enable_secondary_layout_pass    "false"         // Setting this to false causes text (chat messages) to not wrap.
        // panorama_max_text_shadow_strength        "10"            // Freaks out text shadows.
        // panorama_temp_comp_layer_min_dimension   "128"           // Based on the name I'm implied to believe this is the minimum size for panorama compositing, ie blur, rounded corners, etc. [def: "512"]
        // panorama_worldpanel_update_culling       "true"          // Messes with health bar rendering, the information will be inaccurate unless close to the target if set to true. It is weird.       [def: "false"]
        // phys_batch_ray_test                      "16"            // Don't know what this does? shouldn't be needed deadlock doesn't have many physics objects  [def: "0"]
        // r_citadel_gpu_culling_two_pass           "false"         // Setting this to false will cause issues with frametime [def: "true"]
        // r_citadel_npr_force_solid_outline        "false"         // Causes odd visual bugs with dragons and neutrals when set to true    [def: "false"]
        // r_citadel_npr_outlines                   "false"         // Enable the little black outlines on players. Unfortunately this was disabled and no longer works a few months ago.                                [def: "true"]
        // r_citadel_npr_outlines_max_dist          "1"             // Limits outline distance to reduce unnecessary processing.        [def: "1000"]
        // r_citadel_selection_outline2_alpha       "0.2"           // Outlines on enemy players and abilities on a scale of 0-1.       [def: "0.8"]
        // r_dopixelvisibility                      "0"             // Causes issues with boxes being invisible
        // r_draw3dskybox                           "0"             //  Enables drawing the 3D skybox layer (distant geometry).         [def: "1"]
        // r_draw_first_tri_only                    "true"          // Only draw the first triangle. Only works on dx11, causes issues with every playermodel and the hud for some reason [def: "false"]
        // r_draw_first_tri_only                    "true"          // Only draws the first triangle. Surprisingly this only supports dx11 [def: "false"]
        // r_draw_instances                         "0"             //causes boxes to freak out on dx11
        // r_draw_overlays                          "0"             //causes problems with the hud
        // r_drawdecals                             "1"             // *Render decals. If not set to true lash's slam and warden's ult indicators become quite difficult to see.                                                  [def: "1"]
        // r_drawskybox                             "true"          // Can't be changed anymore                                             [def: "true"]
        // r_drawtracers                            "0"             // Makes lash's ground slam marker invisible. I would enable it anyway but I don't like getting fifty trillion "how do I fix this" dms
        // r_drawtracers                            "false"         // disables lash's ground strike indicator
        // r_dx11_software_cmd_lists                "0"             // causes a lot of issues
        // r_extra_render_frames                    "1"             // Setting this to anything above 0 causes issues with latency. negative values cause the game to crash. [def: "0"]
        // r_frame_sync_enable                      "false"         // Setting this to false causes vram to overflow to normal ram for some reason? Game freaks out.                [def: "true"]
        // r_opaque                                 "false          // makes the map invisible
        // r_opaque                                 "false"         // Causes the map to not be rendered.
        // r_showdebugoverlays                      "true"          // Shows a ton of debug overlays IT MAKES ME SO HAPPY I LOVE IT     [def: "false"]
        // r_skinning_enabled                       "false"         // makes players a pose
        // r_translucent                            "false"         // Messes up all particles
        // r_wait_on_present                        "true"          // Seems to cause frame rate to artificially lower
        // sc_aggregate_gpu_culling_show_culled     "true"          // Debug I think, doesn't seem to do anything                     [def: "false"]
        // sc_aggregate_render_mesh_shader          "false"         // Using mesh shaders if available instead of drawcalls.          [def: "true"]
        // sc_aggregate_show_outside_vis            "true"          // This makes the entire map stop rendering             [def: "false"]
        // sc_disable_procedural_layer_rendering    "false"         // Disables rendering, ie the screen is black.          [def: "false"]
        // sc_skip_traversal                        "true"          // Disables rendering, ie the screen is black.          [def: "false"]
        // sc_throw_away_all_layers                 "true"          // Disables rendering, ie the screen is black.          [def: "false"]
        // subtick_buttons_enabled                  "true"          // Makes it so people on windows systems cannot move
        // music_hideout_debug_enabled              "true"          // Doesn't do anything
        fog_enable               "false"
        fog_enableskybox         "false" // I doubt the fog commands actually are modifiable but I am maintaining their inclusion for posterity
        volume_fog_enable_jitter "false" // Don't think I can
        // --------------------------------- END OF CONFIG OptimizationLock -- ver. 3.4 ------------------------------- \\


        // ====================== SV commands we cannot change but I want to maintain documentation for ======================
        // skeleton_instance_lod_optimization      "false"  // Compute LOD mask internally like since 2016, i.e. force all LOD groups' bones to compute [def: "false"]
        // ragdoll_parallel_pose_control           "1"      // Multithreaded ragdoll handling, better performance (if ragdolls aren't disabled). [def: "0"]
        // r_light_flickering_enabled              "0"      // Enables light flicker effects where used.                        [def: "1"]
        // r_decals                                "1"      // Maximum number of decals allowed. (lower = fewer bullet holes/blood/impact marks). [def: "2048"]
        // r_decals_default_fade_duration          "1"      // How quickly decals (bullet holes) fade                           [def: "3"]
        // particle_cluster_use_collision_hulls    "false"  // Should make particles able to pass through each other. Saves some perf   [def: "true"]
        // ent_joint_lines                         "false"  // [def: "true"]        // These shouldn't be needed?
        // ent_joint_names                         "false"  // [def: "true"]        //
        // disable_source_soundscape_trace         "true"   // Bypasses lookup of soundscapes for indvidual audio sources when enabled. [def: "false"]
        // animgraph_enable_parallel_op_evaluation "1"      // Allows animgraph operator evaluation to run in parallel (performance).   [def: "0"]
        // animgraph_enable_parallel_preupdate     "1"      // Allows animgraph pre-update work to run in parallel (performance).       [def: "0"]
        // phys_threaded_cloth_bone_update         "1"      // I am inclined to believe this makes the cloth update threaded    [def: "0"]
        // phys_threaded_kinematic_bone_update     "1"      // I am inclined to believe this makes the cloth kinematics threaded    [def: "0"]
        // phys_threaded_transform_update          "1"      // Same as above                                                    [def: "0"]
        // particle_cluster_nodraw                 "1"      // Skips drawing particle “clusters”/grouped particle batches (performance, fewer small effects). [def: "0"]
        // parallel_perform_invalidate_physics     "false"  // Not sure                                                         [def: "false"]
        citadel_npc_force_animate_every_tick "false" // Don't change this, it does what it says on the tin.              [def: "true"]
        // citadel_perf_interval_report_s          "100000" // The interval that we record performance stats to the log at measured in seconds [def: "60"]
        // citadel_hideout_enable_testing_tools    "true"   // Unfortunately this doesn't work    [def: "false"]















        rate
        {
            min     "98304"
            default "786432"
            max     "1000000"
        }

        // Networking - General
        sv_minrate                   "98304"
        sv_maxunlag                  "0.500"
        sv_maxunlag_player           "0.200"
        sv_lagcomp_filterbyviewangle "false"
        cl_usesocketsforloopback     "1"
        cl_poll_network_early        "0"
        cq_buffer_bloat_msecs_max    "120" // 7.68 ticks @64hz max cq bloat

        // Networking - Induced latency (pred offset)
        cl_tickpacket_recvmargin_desired              "5" // 5 ms base, min. floor for protecting against thrashing the queue
        cl_tickpacket_desired_queuelength             "1"
        cl_async_usercmd_send_disabled_recvmargin_min "0.5" // Additional frame since we do not use the async usercmd send (potentially unneccessary)
        cl_clock_buffer_ticks                         "1"   // Buffer added to the simulation clock margin ( affects pred offset and cadence of client world ticks )
        cl_interp_ratio                               "0"
        cl_async_usercmd_send                         "false" // We don't support early prediction at the moment, which async send requires

        // Nav gen
        nav_gen_connect_dist_a "2.0"

        // Spew warning when adding/removing classes to/from the top of the hierarchy
        panorama_classes_perf_warning_threshold_ms "0.75"

        // Panorama - enable minidumps on JS exceptions
        panorama_js_minidumps "1"
        // Enable the render target cache optimization.
        panorama_disable_render_target_cache "0"

        // Enable the composition layer optimization
        panorama_skip_composition_layer_content_paint "1"

        // Steam audio loading data
        snd_steamaudio_load_reverb_data     "0"
        snd_steamaudio_load_pathing_data    "0"
        snd_steamaudio_load_occlusion_data  "0"
        snd_steamaudio_load_dimensions_data "1"
        snd_steamaudio_load_materials_data  "0"

        // Steam Audio project specific convars
        snd_steamaudio_enable_custom_hrtf                                "0"
        snd_steamaudio_active_hrtf                                       "0"
        snd_steamaudio_pathing_order                                     "3"
        snd_steamaudio_pathing_order_rendering                           "3"
        snd_steamaudio_enable_pathing                                    "0"
        snd_steamaudio_enable_reverb                                     "0"
        snd_steamaudio_reverb_level_db                                   "-6"
        snd_steamaudio_enable_pathing                                    "0"
        snd_steamaudio_invalid_path_length                               "0.0"
        snd_steamaudio_max_probes_customdata_dimensions                  "100000"
        snd_steamaudio_dimensions_grid_height_max                        "100"
        snd_steamaudio_baked_dimensions_probelookup_usealternate         "1"
        snd_steamaudio_custombake_dimensions_size_and_inout_bake_enabled "1"
        snd_steamaudio_custombake_dimensions_outsidefield_bake_enabled   "0"
        snd_steamaudio_custombake_dimensions_smallsizefield_bake_enabled "0"
        snd_steamaudio_dimensions_max_ray_length                         "2500"
        cl_disconnect_soundevent                                         "citadel.convar.stop_all_game_layer_soundevents"
        snd_event_browser_default_stack                                  "citadel_default_3d"

        // voip
        voice_in_process "1"

        // Sound debugging
        snd_report_audio_nan "1"

        // Audio system settings
        snd_sos_max_event_base_depth "10"
        sos_use_guid_filter          "1"

        voice_always_sample_mic
        {
            version "2"
            default "0"
        }

        reset_voice_on_input_stallout "0"
        voice_input_stallout          "0.5"

        audio_enclosure_calc_enabled "0"

        sc_layer_batch_threshold_fullsort "20"

        // Perf/Parallelism
        iv_parallel_restore "1"

        // For perf reasons, since we don't use source-based DSP:
        disable_source_soundscape_trace "1"


        fps_max    "400"
        fps_max_ui "120"

        in_button_double_press_window "0.3"

        // Convars that control spatialization of UI audio.
        snd_ui_positional            "1"
        snd_ui_spatialization_spread "2.4"

        // sound volume rate change limiting
        snd_envelope_rate                        "100.0"
        snd_soundmixer_update_maximum_frame_rate "0"

        //don't let people mess with speaker config settings.
        speaker_config
        {
            min     "0"
            default "0"
            max     "2"
        }


        snd_soundmixer                   "Default_Mix"
        cloth_filter_transform_stateless "0"

        cl_joystick_enabled       "0"
        panorama_joystick_enabled "0"

        snd_event_browser_focus_events "true"

        cl_max_particle_pvs_aabb_edge_length "100"

        // Particles
        cl_aggregate_particles       "true"
        r_particle_batch_collections "1"

        citadel_enable_vdata_sound_preload "true"

        r_add_views_in_pre_output "1"

        // Disable Cubemap Brightening
        lb_cubemap_normalization_max "1"

        update_all_keyframed_in_spatial_partition_update               "0"
        parallel_update_surrounding_bounds_in_spatial_partition_update "1"
        always_perform_full_spatial_partition_update                   "1"
        cl_interp_parallel                                             "1"
        parallel_perform_invalidate_physics                            "1"
        phys_agg_world_compounds                                       "0"

        cl_updaterate                "128"
        sv_parallel_checktransmit    "2"
        net_gather_child_fields_only "1"
    }

    Memory
    {
        EstimatedMaxCPUMemUsageMB "1"
        EstimatedMinGPUMemUsageMB "1"

        ShowInsufficientPageFileMessageBox      "1"
        ShowLowAvailableVirtualMemoryMessageBox "1"
    }
}
