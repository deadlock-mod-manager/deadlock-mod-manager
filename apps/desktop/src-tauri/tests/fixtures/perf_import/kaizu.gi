// twitch.tv/kaizuchaneru
//                                                    ++:     .:=**:
//                              .                    ++    :===-::-:          .:
//                           .:*+==-.               .#   .+=:              :==-#=-
//                           #=. .-:===.            .#   #:             -==-:-:..++
//                           #. ::--. :=+=.  .::::---%- +*..         :=+-. .--:: .#
//                           #.:::::--   :=*+--::::...+.==--==--: .=+-.   --::::: #
//                           #.::::--==:    ::.       .-*:  ..:-=#+:    :=--:::::.#.
//                           #:::::=:  :-    .=+-:::::. -: :::..:-::.  --. -=::::.#:
//                           #::::==. :.:=::-:.                    .:-==.. .==::-.#.
//                          .%-:-==   .:-=-.                          .-=-:. -=--:#
//                         =+=:-=.   :==:            .                   :=-   -=:#
//                        *= :-:+.  .=:             -+-                    -- :+-=*
//                       #-  .=.=+.:=              -=-=                     :==+.*-
//                      *-    =.-+=-         ..    =--+:                      += @:
//                     ++     -- *:     :=::-==-  :+--==       .=              ==+#
//                    .#       ==:     .+...  .-+.:=---=:      .+               +.=+
//                    *-       =-      +:-  ..=: *:=----+.     .+                +.#
//                    #       :=       +-- .=: .--:=----==      =       .=#:     :=+=
//                   :*       +.        =:------: .=--==-==     *:*+=--=#*==      -*+
//                   =+     .+=           +:      =*---=+-== -. @#-:=%%**++**.     ##
//                   =+   .--+: .     =*+**===:  +*==---=+==-+. #-*=++:  :=*@=     =%:.
//                  -* :--  +.... .. .-=#**+%- *+ :=-=--=--=+-:# :##==+****#*: .. :#.:-:
//                  .=#::  .==.:.. ...   =..::-#=..-#=+=-== .-++#-. -%#*++++*+......%:..:-==-
//               -*#*+-..=+-==::::.-....:=  :++----:*#=+==== .=++:---:=#+.  =: .::..#*.....:.
//                ....#+--. -=::::.+-...-=:+=.       #==:-=+= +%.   .   -=-.=-..==..*#:
//                  :=*+::  ==:--:.-+--:+@#=::::..  .:#:  .:==#* ..   .::-+#@+-:+-..*+.=-.
//                 =#%%+..  ==----.:=*==*@%@@@@@@@@%%*+#:    .*=:+#%@@@@@@@%@+=++-.:**  .-:.
//               :-=-:    ..++----.--=+==%.=@%::@%@%+**-++:   :##%+@@#@-.. -%=++--.:#*--::-=+.
//               =*+===+++++##----::---%*%*-*+::+===     .=+=-.#@=.==-+:   %#%#---.-%. ....
//                   ..-+   :@--+=:.---%:-#-=-:..-+.        .--=*=-..--   .=.@*-=::+#
//                      =   .%*-=*-.---%-    :..::.              .....      =@+--.-%:
//                      +   .=@=-+=-.--+#     ...  .       .             .-**%=-.:#*
//                      =.  .=+%=-%*-.--#%=:.          .::::.:.      .:-=++:*+::=#+
//                      =.  .=-+%+@+++---##%#++--:...    ...:..::-=+#*-**:.*%+=+=+.
//                     =.  .====+#*-::=+%@#%*+*%@@@@@@#*+*#+@@%##**@+*@-. +%#:  --
//                      +   :=====-=#*-. =@##%#=*@@@@@@@@@@%**:===*@#*@- .-**-   .=
//                     .=   :======+-=##*=+%+%- %%@@@@%%#%@@@#=-*+-##%-:=**=-=:   +
//                     --   -=====++-+=++**#%%+.#*@@%@@*+-=#@@%..:-%@#*@#-=====   --
//                     =.   ======+-=++++=+=%%#%*@+ ..+@@@%%@%*-   *- *@@=-+===-   +
//                    .=   :=====+==++++++=#@=+%-.#=.  =%-=@@@%%*=#@-:+@@#-=+===-  :-
//                    --   -====+=-++++++++=#%@@@+.*%#%*   :%@@@@*=@@#=*@++-=+===-  =.
//                    +   :====+=-++++++++==+#@@@@%=.*@-    -@@%-..:*@#*%=++-=+====. =
//                   :=::-====+==++++++++==++=+##*#+-%@=.-=#%%#++++==#@%+++++==+====:=:
//                                                 .:-==-:.      ....

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

    //PGIVersion "39A735A413003C88A806B364C32DFC6D077E551B9E4EC6C7B11D41E8E67BFA0C"

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
            Game_LowViolence "citadel_lv"
            Game             "citadel/addons"
            Mod              "citadel"
            Write            "citadel"
            Game             "citadel"
            Game             "core"
        }

        UserSettingsPathID       "USRLOCAL"
        LegacyUserSettingsPathID "MOD"
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
        IndexBufferPoolSizeMB              "32"
        UseReverseDepth                    "1"
        Use32BitDepthBuffer                "0"
        Use32BitDepthBufferWithoutStencil  "0"
        VulkanMutableSwapchain             "1"
        LowLatency                         "1"
        VulkanRequireSubgroupWaveOpSupport "1"
        VulkanRequireDescriptorIndexing    "1"
        VulkanStagingPMBSizeLimitMB        "384"
        VulkanOnlyTestProbability          "0"
        VulkanDefrag                       "1"
        MinStreamingPoolSizeMB             "1024"
        MinStreamingPoolSizeMBTools        "2048"
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
            //Compressor              "lz4"
            //CompressMipsOnDisk      "1"
            //CompressMinRatio        "95"
            AllowNP2Textures           "1"
            AllowPanoramaMipGeneration "1"
            //PublicToolsDefaultMaxRes "2048"
        }
    }

    Source1Import
    {
        forcevtxfileupconvert "1"
    }

    WorldRenderer
    {
        EnvironmentMaps             "2"
        EnvironmentMapFaceSize      "4096"
        EnvironmentMapRenderSize    "1"
        EnvironmentMapFormat        "BC6H"
        EnvironmentMapPreviewFormat "BC6H"
        EnvironmentMapColorSpace    "linear"
        EnvironmentMapMipProcessor  "GGXCubeMapBlur"
        // Build cubemaps into a cube array instead of individual cubemaps.
        EnvironmentMapUseCubeArray   "1"
        EnvironmentMapCacheSizeTools "300"
        BindlessSceneObjectDesc      "CitadelBindlessDesc"
        GrassCastsShadows            "0"
    }

    SceneSystem
    {
        GpuLightBinner                 "1"
        FogCachedShadowAtlasWidth      "0"
        FogCachedShadowAtlasHeight     "0"
        FogCachedShadowTileSize        "0"
        GpuLightBinnerSunLightFastPath "1"
        CSMCascadeResolution           "0"
        SunLightManagerCount           "0"
        SunLightManagerCountTools      "0"
        DefaultShadowTextureWidth      "0"
        DefaultShadowTextureHeight     "0"
        DynamicShadowResolution        "1"

        TransformTextureRowCount          "128"
        TransformTextureRowCountToolsMode "128"
        SunLightMaxCascadeSize            "1"
        SunLightShadowRenderMode          "Depth"
        NonTexturedGradientFog            "1"
        CubemapFog                        "0"
        VolumetricFog                     "0"
        FrameBufferCopyFormat             "R11G11B10F"
        Tonemapping                       "0"

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
        EnableParticleShaderFeatureBranching "1"
        Float16HDRBackBuffer                 "1"
        PET_SupportFadingOpaqueModels        "1"
        BindlessParticleShader               "1"
        Features                             "non_homogenous_forward_layer_only"
    }

    Physics
    {
        EnableWorldCompounds "1"
    }

    ConVars
    {
        //Stuff that matters to preference:
        r_aspectratio "2.3" // FOV: 1.33=70fov | 1.56=75fov | 1.75=80fov | 2.0=85fov | 2.15=90fov | 2.49=100fov | 3.0=110fov | 3.5=120fov

        // Camera smoothing/wobble — preference only, no FPS impact:
        citadel_camera_wobble_disable "true" // disable camera wobble

        // VIEW DISTANCE & POP-IN  (trade FPS vs visible popping)
        r_propsmaxdist                      "600"      // Max prop draw distance (default 1200). Controls how far you see boxes/props
        r_size_cull_threshold               "1.75"     // Cull objects below 1.65% screen size (default 0.8). Smaller = see objects earlier; don't exceed
        r_size_cull_threshold_shadow        "1.0"      // More aggressive shadow cull (default 0.2)
        r_farz                              "4500"     // Far clipping plane override (default -1 = map-controlled, then this). Lower = more FPS + more popping. Vindicta players: try 5000-9000
        r_mapextents                        "4500"     // Max map dimension for far clip (default 16384). Lower = sooner far-clip + popping. Raise if buildings pop
        sc_screen_size_lod_scale_override   "0.000001" // Force lowest LOD on everything (default -1). Biggest LOD FPS gain; extreme pop-in
        citadel_portrait_world_renderer_off "1"        // Turn off shop portrait hero renderer (devonly, default false)


        // DECALS
        //r_drawdecals 0 // Don't render decals at all, comment out if you want to see lash slam, warden ult black box, etc
        r_character_decal_resolution "128" // Character decal texture 128px (default 1024) - 16x less VRAM

        //try not to edit the stuff below unless you know what youre doing


        // SHADOWS
        r_citadel_shadow_quality                    "1" // Disable shadow quality (Citadel path)
        r_shadows                                   "0" // Disable all shadow rendering (cheat)
        r_citadel_shadow_caching                    "0" // Disable shadow caching
        r_citadel_distancefield_shadows             "0" // Disable distance-field soft shadows (ray-marched)
        sparseshadowtree_enable_rendering           "0" // (already default false — safe to reinforce)
        sparseshadowtree_disable_add_layers         "1" // Exclude all SST-eligible geo from shadow rendering
        sparseshadowtree_disable_for_viewmodel      "1" // (already default true — safe to reinforce)
        lb_precomputed_shadowmap_enable             "0" // Disable precomputed shadowmaps
        r_citadel_gpu_preview_baked_shadows         "0" // Disable baked/preview shadow denoising
        r_citadel_gpu_preview_denoise               "0" // Disable shadow denoiser (saves GPU passes)
        r_citadel_gpu_preview_denoise_shadow_passes "0" // Zero shadow denoise passes
        r_citadel_gpu_preview_denoise_passes        "0" // Zero denoise passes
        // CSM (cascade shadow map) tweaks — shadows disabled above, these reinforce:
        lb_csm_cascade_size_override          "1"   // CSM cascade 1px (default -1). Shadows off anyway
        lb_csm_draw_alpha_tested              "0"   // Don't draw alpha-tested into CSM (default true)
        lb_csm_draw_translucent               "0"   // Don't draw translucent into CSM (default true)
        lb_dynamic_shadow_resolution          "0"   // No dynamic shadow resolution adjustment (devonly)
        lb_dynamic_shadow_resolution_base     "16"  // 16px base (default 1024). Shadows off anyway
        lb_dynamic_shadow_penumbra            "0"   // Disable shadow penumbra (default true)
        lb_sun_csm_size_cull_threshold_texels "100" // Cull CSM objects at 100 texels (default 10)
        lb_barnlight_shadowmap_scale          "0.5" // Halve barnlight shadowmap resolution (release, default 1)
        lb_enable_shadow_casting              "0"   // Disable all stationary/dynamic shadow casting (devonly)
        lb_timesliced_shadows_dynamic_size    "0"   // Disable timesliced shadow dynamic resizing (default true)
        sc_disable_spotlight_shadows          "1"   // Disable spotlight shadow rendering (cheat, default false)
        r_citadel_gpu_culling_shadows         "1"   // GPU-cull shadow views (default false). Harmless with shadows off

        // FOG & ATMOSPHERICS
        r_enable_volume_fog                  "0" // Disable volume fog
        r_enable_gradient_fog                "0" // Disable gradient fog
        r_enable_cubemap_fog                 "0" // Disable cubemap fog
        r_citadel_fog_quality                "0" // Lowest fog quality
        r_citadel_enable_pano_world_blur     "0" // Disable world-blur (DOF-style haze)
        fog_enable                           "0" // Disable fog entirely (cheat)
        fog_enableskybox                     "0" // Disable skybox fog (cheat)
        volume_fog_density_scale             "0" // Zero volume fog density (cheat)
        volume_fog_enable_jitter             "0" // Disable fog jitter sampling (cheat)
        volume_fog_temporal_filter           "0" // Disable fog temporal filter (devonly)
        volume_fog_intermediate_textures_hdr "0" // Skip HDR ziak intermediate fog textures (devonly, default true). VRAM saver; fog disabled anyway
        r_citadel_distancefield_blur         "0" // Disable distance-field blur (background blur)
        r_drawskybox                         "0"
        r_draw3dskybox                       "0"
        r_monitor_3dskybox                   "0"


        // LIGHTING
        r_multiscattering              "0"
        r_citadel_disable_npr_lighting "1" // ~1 extra FPS but game looks terrible. Uncomment if you don't mind (devonly)
        r_directlighting               "0" // Disable direct lighting (cheat)
        r_arealights                   "0" // Disable area lights
        r_directional_lightmaps        "0" // Disable directional lightmaps
        //r_lightmap_bicubic_filtering 0 // Bilinear lightmap filtering instead of bicubic
        r_lightmap_size                        "1" // 1px lightmap max (default 65536). Lightmaps cheap/disabled anyway
        r_lightmap_size_directional_irradiance "0" // 0px directional irradiance (default -1 = use r_lightmap_size)
        r_light_flickering_enabled             "0" // Disable dynamic light flicker (devonly, default true)
        r_rendersun                            "0" // Disable sun lighting (cheat)
        lb_ssss_samples                        "1" // Disable subsurface scattering on characters (default 11 samples). Big GPU saver
        mat_max_lighting_complexity            "0" // Cap lighting complexity at cheapest (cheat, default 8)
        //r_cubemap_normalization 0 // Skip cubemap normalization pass (devonly, default true). Minor GPU saver
        r_dashboard_render_quality        "0"         // Lower dashboard render quality (devonly, default true)
        mat_async_shader_load             "1"         // Async shader compile load (release, default false). Reduces shader-compile stutter
        r_environment_map_roughness_range "0.01 0.01" // Fade region for envmap sampling (default "0.2 0.3"). Rougher values skip envmaps; 0.01 0.01 = basically turn off map reflections


        // SSAO & AMBIENT OCCLUSION
        r_ssao                                      "0" // Disable SSAO
        r_citadel_ssao_quality                      "0" // Lowest SSAO quality (off)
        r_ssao_blur                                 "0" // Disable SSAO blur pass
        r_citadel_distancefield_ao_quality          "0" // Distance-field AO off (already default 0 — reinforces)
        r_citadel_ssao_thin_occluder_compensation   "0" // Disable thin occluder AO compensation (default 0.5)
        r_citadel_sun_shadow_slope_scale_depth_bias "0" // Zero shadow slope bias (default 3.54). Cleaner with shadows off


        // POST-PROCESSING
        //r_postprocess_enable 0 // Disable ALL post-processing. Uncomment if not using post-processing mods like Sunlock or you want the game to look grey
        r_effects_bloom               "0" // Disable bloom
        r_post_bloom                  "0" // Disable bloom post-pass (default false — already off, reinforces)
        r_bloom_tent_filter_radius    "0" // Zero bloom tent-filter radius (cheat, default 0 — already off, reinforces)
        r_depth_of_field              "0" // Disable depth of field (default true)
        r_citadel_depthoffield_enable "0" // Hard-disable DOF (default false — already off, reinforces)
        r_citadel_upscaling           "0" // Disable upscaling (0=off, default 4=DLSS/FSR). Keeps native res; reduces CPU post work. Uncomment if not using upscaling
        //mat_colorcorrection 0 // Disable color correction. Uncomment if not using post-processing mods like Sunlock
        r_citadel_cloak_blur_amount "0" // Disable cloak/blur post-effect (cheat, default 0.01). Saves blur pass for cloaked units
        //mat_colcorrection_disableentities 1 //uncomment if you want grey lookin game

        // DISTANCE FIELD (major GPU subsystem)
        r_distancefield_enable                  "0" // Disable entire distance-field subsystem (default true). Major GPU saver - kills DF AO/blur/shadows
        r_citadel_distancefield_farfield_enable "0" // Disable DF far-field trace pass (devonly, default true)
        r_citadel_distancefield_down_sample     "0" // DF downsample 0 (default 1). Reinforces DF shutoff


        // PARTICLES & EFFECTS (big CPU saver)
        r_particle_max_detail_level  "0"      // Only spawn lowest-detail particle systems (default -1)
        r_particle_max_draw_distance "300000" // Reduce particle draw distance (default 1e6)
        r_particle_max_size_cull     "256"    // Lower threshold before particles skip culling (default 0 = no cull)

        r_particle_cables_render       "1" // Skip rendering cable/rope particle geometry (default 0? keep 1 = render minimal)
        r_particle_cables_cast_shadows "0" // Cable particles don't cast shadows (default 1)
        r_particle_batch_collections   "1" // Batch particle collections (devonly, default false). Fewer draw calls

        //r_particle_min_timestep 0.00241 // Min particle sim timestep (default 0). Throttle particle sim frequency slightly (thanks sqooky)
        r_particle_skip_postsim                  "1"     // Skip particle post-sim step (devonly, default false). CPU saver
        r_physics_particle_op_spawn_scale        "0"     // Zero physics particle op spawn scale (devonly, default 1). Fewer physics-particle interactions
        r_particle_fixedrandomseeds              "1"     // Use fixed random seeds for particles (devonly, default false). Deterministic = cacheable, minor CPU saver
        cl_particle_fallback_base                "1"     // Enable fallback to cheaper particle FX under load (default 0)
        cl_particle_fallback_multiplier          "2"     // More aggressively use cheap particle fallbacks (default 0)
        cl_particle_sim_fallback_threshold_ms    "1"     // Lower threshold before fallback (default 6)
        cl_particle_sim_fallback_base_multiplier "10"    // More aggressive fallback once over threshold (default 5)
        cl_max_particle_pvs_aabb_edge_length     "50"    // Cull particle systems outside smaller PVS AABB (default 100)
        cl_particle_batch_mode                   "1"     // Batch particle processing (default 1 — reinforces)
        cl_impacteffects                         "0"     // Disable client impact effects (bullet hit FX) (devonly)
        cl_show_splashes                         "0"     // Disable water/impact splash particles (devonly)
        r_citadel_screenspace_particles_full_res "0"     // Screen-space particles at half-res (default true)
        particle_cluster_nodraw                  "1"     // Don't draw particle clusters (devonly sv/cl/rep, default false). CPU saver
        particle_cluster_use_collision_hulls     "false" // Disable particle collision hulls (default true). Fewer collision checks
        r_RainParticleDensity                    "0"     // Disable rain particles (devonly, default 1)
        fx_drawmetalspark                        "0"     // Disable metal-spark effects on bullet hits (devonly, default 1)
        func_break_max_pieces                    "0"     // No breakable-prop debris pieces (sv/a/rep, default 15)
        props_break_max_pieces_perframe          "1"     // Fewer breakable prop pieces per frame (default 16)
        r_impacts_alt_orientation                "0"     // Simplify impact orientation (minor)
        //violence_ablood kaiz // Disable alien blood particles (a, default true). CPU saver on damage events
        violence_agibs  "0" // Disable alien gib entities (default true)
        violence_hblood "0" // Disable human blood particles
        violence_hgibs  "0" // Disable human gib entities


        // GRASS & FOLIAGE
        r_grass_quality              "0" // Disable grass (0=Off)
        r_grass_allow_flattening     "0" // Disable grass flattening simulation
        r_grass_vertex_lighting      "0" // Disable per-vertex grass lighting (already default 0 — reinforces)
        r_grass_start_fade           "0" // Fade out grass at 0 distance (default 2000). Grass invisible
        r_grass_end_fade             "0" // End grass fade at 0 (default 3000). Grass invisible
        sc_clutter_enable            "0" // Disable scene clutter (rocks, debris, small props)
        r_world_wind_strength        "0" // kDisable world wind (stops grass/tree vertex animation)
        r_world_wind_frequency_grass "0" // Zero grass wind animationaiz
        r_world_wind_frequency_trees "0" // Zero tree wind animation


        // HAIR  p sure those don't work but might aswell keep it for organization sakes
        r_render_hair                 "0" // Don't render hair — bald models (cheat)
        r_hair_ao                     "0" // Disable hair AO
        r_hair_indirect_transmittance "0" // Disable hair indirect light transmission
        r_hair_shadowtile             "0" // Disable hair shadow tiling
        r_hair_wind_motion_scale      "0" // Zero hair wind animation
        r_hair_wind_noise             "0" // Disable hair wind noise
        r_force_thick_hair            "0" // Don't force thick hair (cheaper)


        // MODEL LOD, GEOMETRY & CULLING
        skeleton_instance_lod_optimization "1" // Compute LOD mask internally (cheaper bone LOD, default false)
        r_morphing_enabled                 "0" // Disable vertex morph targets / facial expressions (cheat)
        r_smooth_morph_normals             "0" // Disable smooth morph normals (cheaper)
        scene_clientflex                   "0" // Disable client-side flex (facial) animation (default true)
        cl_enable_eye_occlusion            "0" // Disable eye occlusion queries (default true)
        enable_boneflex                    "0" // Disable bone flex — skeletal vertex deformation (cl, a — works live)
        cloth_sim_on_tick                  "0" // Disable per-tick cloth simulation (devonly)
        //cloth_update 0 // Disable cloth update altogether (devonly) you can use this if you use mods that remove character cloaks/coats/etc
        r_strip_invisible_during_sceneobject_update "1" // Strip invisible objects during scene update (devonly, default false). CPU saver
        // Instanced mesh LOD/cull (trees, rocks, props):
        sc_instanced_mesh_lod_bias              "3"   // Force lower LOD on instanced meshes (devonly, default 1.25)
        sc_instanced_mesh_size_cull_bias        "3"   // More aggressive size cull on instanced meshes (devonly, default 1.5)
        sc_instanced_mesh_size_cull_bias_shadow "10"  // Shadow size cull bias (default 2). Shadows off anyway
        sc_instanced_mesh_motion_vectors        "0"   // Disable motion vectors for instanced meshes (devonly, default true). No TAA = no need
        sc_instanced_mesh_opaque_fade           "0"   // Disable opaque fade for instanced meshes (devonly, default true). Removes fade passes
        sc_allow_dithered_lod                   "0"   // Disable dithered LOD transitions (devonly, default true). No dithering work
        sc_fade_distance_scale_override         "100" // LOD fade distance scale (cheat, default -1). Tighter fade
        sc_force_materials_batchable            "1"   // Force materials to be batchable (cheat, default false). Fewer draw calls


        // RAGDOLLS, LIGHTS & CLIENT THREADING ziak
        cl_disable_ragdolls      "1" // Completely disable ragdolls (cheat, default false)
        cl_ragdoll_default_scale "0" // Scale ragdoll to 0 (devonly, default 1)
        cl_ragdoll_limit         "0" // No client ragdolls (default 20). Dead units vanish instantly
        //g_ragdoll_maxcount 0 // Max ragdoll count 0 (default 5, devonly sv/cl/rep)
        g_ragdoll_important_maxcount "0" // No important ragdolls (default 2, devonly sv/cl/rep)

        cl_retire_low_priority_lights         "1" // Replace low-priority dlights with high-priority ones (default false)
        cl_batch_entity_list_ops_during_latch "1" // Batch entity list adds/removes to avoid mutex contention (default false)
        rope_collide                          "0" // Disable rope world collision (devonly cl, default 1). CPU saver; ropes not rendered anyway
        //phys_threaded_cloth_bone_update 1 // zThreaded cloth-bone update (devonly sv/cl/rep, default false). [SV] may override iak
        //phys_threaded_kinematic_bone_update 1 // Threaded kinematic bone update (devonly sv/cl/rep, default false). [SV] may override
        //phys_threaded_kaiz_transform_update 1 // Threaded transform update (devonly sv/cl/rep, default false). [SV] may override
        phys_cull_internal_mesh_contacts "1" // Cull internal mesh contacts (devonly rep, default false)
        cl_simulate_dormant_entities     "0" // Don't simulate dormant entities (default? devonly). CPU saver
        cl_interp_parallel               "1" // Run interpolation in parallel for entities with no children (devonly, default false)


        // TEXTURE STREAMING & QUALITY
        r_texture_lod_scale             "2" // Bias textures to lower mips — blurrier, less VRAM (cheat)
        r_fallback_texture_lod_scale    "8" // Fallback geo uses 8x lower mip (default 2) (cheat)
        r_texture_stream_max_resolution "1" // Cap texture resolution at 512px (default unlimited)
        r_texturefilteringquality       "0" // Bilinear filtering (cheapest)
        //r_texture_pool_size 800 // Halve texture pool (default 1600 MB)
        //r_max_texture_pool_size 800 // Match cap
        r_citadel_fsr_enable_mip_bias "0" // Disable FSR mip bias (avoids sharper mip loading, default true)
        // r_texture_eager_eviction 1 // Eagerly evict unused textures (lower VRAM). Uncomment to enable
        v8_maximum_heap_size_mb "1024" //
        vulkan_batch_size       "1000" // Larger Vulkan draw-call batches, fewer CPU submissions (devonly, default 500)


        // ROPES & TRACERS
        r_drawropes       "0" // Don't render ropes/cables (cheat)
        r_ropetranslucent "0" // Disable translucent rope rendering


        // RENDERING PIPELINE
        r_citadel_antialiasing            "0" // Disable AA (default 1)
        vis_sunlight_enable               "0" // Use sky PVS instead of sunlight PVS (cheat, default true). Less PVS work
        r_citadel_clip_sphere_min_opacity "0" // Zero clip-sphere opacity (cheat, default 0.4). Removes clip-sphere see-thru rendering


        // FRAME RATE LIMITS & ENGINE SLEEP
        fps_max                                    "0"  // Uncap FPS (0=off, default 400). Set monitor_hz*1.1 to cap
        fps_max_ui                                 "60" // Cap UI/menu FPS at 60 (default 120)
        fps_max_tools                              "60" // Cap tools-mode FPS (default 120)
        engine_no_focus_sleep                      "0"  // Don't sleep when window loses focus (default 20). Mines CPU alt-tabbed; set 10 if you prefer
        engine_low_latency_sleep_after_client_tick "1"  // Move low-latency sleep after client tick (release, default false). Better latency alignment


        // AUDIO (reduce audio CPU) K
        /snd_ziak_occlusion_bounces "0" // Disable sound occlusion ray bounces (cheat)
        //snd_occlusion_rays 0 // Zero sound occlusion rays (cheat)
        //snd_steamaudio_load_occlusion_data 0 // Skip loading baked occlusion data we disabled (devonly, default true). Saves load time/memory
        //snd_diffusor_simd 1 // Enable SIMD for diffusor audio processor (devonly, default false). Minor audio CPU saver
        //snd_mixahead 0.05 // 50ms audio mix buffer (default 0.001). 0.001 = lowest latency but more CPU; 0.05 adds 50ms latency, saves CPU. Use 0.001 if you have a good CPU
        //audio_enable_vmix_mastering 0 // Disable mastering DSP (cheat, default true). ⚠ May cause audio glitches — test before keeping


        // NETWORKING (reduce prediction CPU) A
        // cl_interp_hermite 0 // Disable hermite interpolation (cheaper, slightly jerkier). ⚠ User notes: test before changing
        // net_skip_redundant_change_callbacks 1 // Skip redundant netvar change callbacks (devonly cl, default false). ⚠ User notes: test before changing
        citadel_use_pvs_for_players "1" // Use PVS for players (devonly sv, default false). Less entity visibility work. [SV]


        // PANO WORLD / UI  (menu/overlay render cost) I
        panorama_disable_blur       "1"  // Disable UI blur (devonly, default false). Removes blur GPU passes in menus
        panorama_disable_box_shadow "1"  // Disable UI box shadows (devonly, default false)
        panorama_max_fps            "30" // Cap Panorama menu FPS at 30 (devonly, default 120). CPU save in menus
        panorama_max_overlay_fps    "30" // Cap overlay UI FPS at 30 (devonly, default 60)
        //panorama_worldpanel_update_culling 1 // Cull updates for off-screen in-world UI panels (devonly cl, default false) could help with perf, need test


        // MISC QUALITY KNOBS  (glow, HUD, damage numbers) Z
        citadel_trooper_outline_enabled "true"
        citadel_video_preset            "0" // Lowest video preset (default 3)
        mem_level                       "1" // Low memory level (default 2)
        //r_citadel_npr_outlines 0918 // Disable NPR cartoon character outlines (cheat)
        // r_citadel_glow_health_bars 0 // Disable glow health bars. ⚠ Makes health bars invisible through walls — gameplay readability hit
        citadel_boss_glow_disabled    "1"     // Disable boss glow (release, default false)
        citadel_trooper_glow_disabled "false" // Disable enemy trooper glow (release, default false)
        //citadel_in_world_item_panel_dpi 0.5 // In-world item panel texture scale (default 2) - 4x less VRAM
        citadel_hud_objective_health_idle_timeout   "0"    // Hide objective health HUD immediately (default 7)
        citadel_damage_text_lifetime                "0.01" // Damage numbers vanish instantly (default 1.5)
        citadel_damage_text_lifetime_new            "0.1"  // Accumulated damage numbers 0.1s (default 1.5)
        citadel_damage_offscreen_indicator_disabled "1"    // (default true — reinforces)
        mat_set_shader_quality                      "0"    // Force shader quality low (devonly). ⚠ May force shader recompiles; test first
        panorama_allow_transitions                  "0"
        r_citadel_npr_force_solid_outline           "1"

        // LIGHTING EXTREME
        lb_enable_lights                    "0"  // Disable ALL lights
        lb_enable_dynamic_lights            "0"  // Disable dynamic lights
        lb_enable_stationary_lights         "0"  // Disable stationary lights
        lb_enable_sunlight                  "0"  // Disable sunlight (reinforces r_rendersun 0)
        lb_enable_baked_shadows             "1"  // Use baked shadows (lighter on rendering)
        lb_enable_fog_mixed_shadows         "0"  // Disable fog-mixed shadows
        lb_mixed_shadows                    "0"  // Disable mixed shadows (default true)
        lb_max_visible_barn_lights_override "1"  // Cap visible barn lights (default -1)
        lb_max_visible_envmaps_override     "-1" // Cap envmap reflections (default -1)

        //old cvars that probably still works
        animated_material_attributes         "0"
        citadel_camera_parrot_smoothing_rate "0"
        citadel_npc_force_animate_every_tick "0"
        //citadel_visibility_queue_rate 4 //use 2
        cl_globallight_shadow_mode                "0"
        cl_glow_brightness                        "0"
        cl_smoothtime                             "0.01"
        lb_cubemap_normalization_max              "1"
        lb_cubemap_normalization_roughness_begin  "0.01"
        lb_dynamic_shadow_resolution_quantization "32"
        lb_enable_newsum                          "0"
        lb_shadow_map_cull_empty_mixed            "1"
        mat_slopescaledepthbias_shadowmap         "0" // Disables shadow depth bias math
        mat_depthbias_shadowmap                   "0" // Disables shadow depth bias math
        mat_tonemap_bloom_scale                   "0"
        //panorama_disable_descendant_filtering 1
        r_aoproxy_cull_dist "0.01"
        //"r_citadel_depth_prepass_cull_threshold" "0"
        r_citadel_depth_prepass_dynamic_objects "0"
        //sc_force_single_display_list_per_layer 1
        lb_shadow_texture_width_override  "16" // Shrinks the global shadow atlas to 16 pixels
        lb_shadow_texture_height_override "16" // Shrinks the global shadow atlas to 16 pixels
        lb_enable_binning                 "0"

        r_frame_sync_enable "0"

        panorama_comp_layer_lru_lifetime      "4"        // default 1 — keeps cached composition layers alive so re-open reuses them
        panorama_render_target_cache_max_size "67108864" // 64 MB vs default 30 MB — cached UI layers survive between toggles
        //citadel_distance_mouse_move_for_minimap_drawing "1"
        r_nearz                                   "12"
        r_particle_max_texture_layers             "4"
        r_update_particles_on_render_only_frames  "1"
        r_skip_precache_validation_check          "1"
        engine_max_ticks_to_simulate              "2"
        r_renderdoc_auto_shader_pdbs              "0"
        citadel_bullet_shot_offset_fade_time      "0"
        csm_viewmodel_farz                        "1"
        sparseshadowtree_leaf_precision_viewmodel "0"
        csm_viewmodel_max_shadow_dist             "1"
        csm_viewmodel_max_visible_dist            "1"
        r_particle_newinput                       "1"
        cl_globallight_freeze                     "1"

        //snd_disable_mixer_duck 1
        //snd_kaizdisable_mixer_solo 1
        cpu_level                     "0"
        gpu_level                     "0"
        gpu_mem_level                 "0"
        csm_max_num_cascades_override "1"
        csm_max_shadow_dist_override  "1000"
        //snd_steamaudio_load_dimensions_data 0
        //snd_steamaudio_load_materials_data 0
        anim_resource_validate_on_load "0"

        //r_dopixelvisibility 0 //will cause console spam
        //r_pixelvisibility_partial 0 //will cause console spam

        //CNS cvars

        minimap_trooper_update_rate_hz "2" //(default 5) — fewer minimap updates, server-side.

        citadel_camera_soft_collision "0" //(default 1)

        citadel_death_ragdoll_duration "0"

        //r_indirectlighting 0 //turns character black

        csm_max_visible_dist                  "1000" //(7500)
        csm_sst_max_visible_dist              "500"  //(2000)
        lb_csm_cross_fade_override            "0"    //(-1)
        lb_csm_distance_fade_override         "0"    //(-1)
        lb_cull_onscreen_bounce_light_shadows "1"    //(false)

        r_particle_mixed_resolution_viewstart "100"

        cl_aggregate_particles "1"

        r_texture_stream_throttle_count  "1" //(default 3)
        r_texture_stream_throttle_amount "4" //(default 10) fewer streaming ops per frame, smaller individual hitches, slightly slower texture pop-in

        r_particle_gpu_implicit_lds_cache "1" //(default false) — caches implicit particle data in GPU LDS (on-chip), fewer VRAM round-trips per particle. Try it.

        r_animatable_mesh_shaders "1" //(default false, cheat) — animatable meshes via GPU shader path instead of CPU skinning. Experimental-sounding name, test in bot match, watch for deformed models.

        thread_pool_option "0"

        //Everyone's always telling you to be humble. When was the last time someone told you to be great?

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
