// ====================================
//           ...       ....           =                         
//        ...   ..   ..    ...        =                         
//       .        . .  o      .       =                        
//      .    /\_____/\          .     =                        
//      . o (  ^ . ^  )   o    .      =                        
//      .    \  ~w~  /        .       =                        
//     o .    )     (    o    .       =                        
//        .  ( (   ) )       .        =                        
//          (_)-'_'-(__)              =                        
//      o    |  ___  |          o     =                        
//           | /   \ |                =                        
//      o    |/     \|    o           =                        
//            \     /                 =                        
//             \___/                  =                        
//          HELLO WORLD!              =
// ====================================

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

    DisallowGameInfoConditionals "0"
    PGIVersion                   "6E09D3ED5A47F6A97443813F0E00F90BAA435918F82DF0C9B5DA46D27A33D903"

    Localize
    {
        DuplicateTokensAssert "1"
        DisallowTokenContexts "1"
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

        // Deadlock Mod Manager - Start
        SearchPaths
        {
            Game_Language "citadel_*LANGUAGE*"
            Game          "citadel/addons"
            Mod           "citadel"
            Write         "citadel"
            Game          "citadel"
            Mod           "core"
            Write         "core"
            Game          "core"
        }
        // Deadlock Mod Manager - End
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
            dev "ToolsVis"      
            dev "ToolsWireframe" 
            tools "ToolsUtil" 
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
            FakeLag             "0" 
            FakeLoss            "0" 
            FakeReorderPct   "0"
            FakeReorderDelay "0"
            FakeJitter       "off"
        }

        SkipRedundantChangeCallbacks "1"
        UseSerializedEntityPool      "1"
    }

    RenderSystem
    {

        AllowPartialMipChainImmediateTexLoads "1"
        UseHardwareGammaRamp                  "0" 
        GraphicsPipelineLibrary            "1"   
        IndexBufferPoolSizeMB              "64"   
        LowLatency                         "1"    
        MinStreamingPoolSizeMB             "512"  
        MinStreamingPoolSizeMBTools        "2048" 
        SwapChainSampleableDepth           "1"    
        Use32BitDepthBuffer                "0"   
        Use32BitDepthBufferWithoutStencil  "0"    
        UseReverseDepth                    "1"    
        VulkanAdditionalShaderCache        "vulkan_shader_cache.foz"
        VulkanDefrag                       "1"   
        VulkanMutableSwapchain             "1"  
        VulkanOnlyTestProbability          "0"   
        VulkanOnly_Linux                   "1"  
        VulkanRequireDescriptorIndexing    "1"   
        VulkanRequireSubgroupWaveOpSupport "1"
        VulkanStagingPMBSizeLimitMB        "384" 
        VulkanSteamAppShaderCache          "1"  
        VulkanSteamDownloadedShaderCache   "1"  
        VulkanSteamShaderCache             "1"  

    }

    NVNGX
    {
        AppID "103371621"
        SupportsDLSS "1"
    }

    Engine2
    {
        SinglePlayerAsyncRendering "1" 
        AllowKeyChordBindings      "1" 
        HasModAppSystems           "1"
        Capable64Bit               "1"
        URLName                    "citadel"
        RenderingPipeline
        {
            SupportsMSAA            "0"
            DistanceField           "1" 
            AmbientOcclusionProxies "0" 
        }
        PauseSinglePlayerOnGameOverlay "1"
        DefensiveConCommands           "1"
        DisableLoadingPlaque           "1"
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
        ToolsDir "../sdktools" 
    }

    pulse
    {
        pulse_enabled          "1"
        strict_fgd_annotations "1"
        client_blackboards     "1"
    }

    Hammer
    {
        CreateRenderClusters          "1"
        DefaultMinDrawVolumeSize      "2048"
        DefaultMinTrianglesPerCluster "16384"
        DefaultPointEntity            "info_player_start"
        DefaultSolidEntity            "trigger_multiple"
        GameFeatureSet                "Citadel"
        LatticeDeformerEnabled        "1"
        LoadScriptEntities            "0"
        NavMarkupEntity               "func_nav_markup"
        OverlayBoxSize                "8"
        RenderMode                    "ToolsVis"
        ShadowAtlasHeight             "0"
        ShadowAtlasWidth              "0"
        SteamAudioEnabled             "1"
        SupportsDisplacementMapping   "0"
        TileGridBlendDefaultColor     "0 255 0"
        TileGridSupportsBlendHeight   "1"
        TileMeshesEnabled             "1"
        TimeSlicedShadowMapRendering  "0"
        UseAnalyticGrid               "0"
        UsesBakedLighting             "1"
        fgd                           "citadel.fgd" 
        Thread32First "1"
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

        DefaultMapBuilders
        {
            bakedlighting "1"
            envmap        "0" 
            nav           "1" 
        }

        MeshCompiler
        {
            OptimizeForMeshlets       "1"
            TrianglesPerMeshlet       "126" 
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
            MinimumVolumePerClusteredMesh      "8192" 
            MaxPrecomputedVisClusterMembership "96"
            MaxCullingBoundsGroups             "128"
            UseAggregateInstances              "1"
            AggregateInstancingMeshlets        "1"
            BakePropsWithExtraVertexStreams    "1"
        }

        BakedLighting
        {
            Version                          "4"
            ImportanceVolumeTransitionRegion "512" 
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
            LightmapGutterSize   "2" 
            UseStaticLightProbes "0"
            LPVAtlas             "1"
            BC6HHueShiftFixup    "0"
            Repack2              "1"
        }

        SteamAudio
        {
            ReverbDefaults
            {
                GridSpacing      "3.0"
                HeightAboveFloor "1.5"
                RebakeOption     "0" 
                NumRays          "32768"
                NumBounces       "64"
                IRDuration       "1.0"
                AmbisonicsOrder  "1"
            }
            PathingDefaults
            {
                GridSpacing       "3.0"
                HeightAboveFloor  "1.5"
                RebakeOption      "0" 
                NumVisSamples     "1"
                ProbeVisRadius    "0"
                ProbeVisThreshold "0.1"
                ProbeVisPathRange "1000.0"
            }
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
         
            AllowNP2Textures            "1"
            AllowPanoramaMipGeneration  "1"
          
        }
    }

    Source1Import
    {
        forcevtxfileupconvert "1"
    }

    WorldRenderer
    {

        BindlessSceneObjectDesc      "CitadelBindlessDesc"
        EnvironmentMapCacheSizeTools "300"   
        EnvironmentMapColorSpace     "linear" 
        EnvironmentMapFaceSize       "256"  
        EnvironmentMapFormat         "BC6H" 
        EnvironmentMapMipProcessor   "GGXCubeMapBlur"
        EnvironmentMapPreviewFormat  "BC6H" 
        EnvironmentMapRenderSize     "1024"
        EnvironmentMapUseCubeArray   "1"    
        EnvironmentMaps              "1"    
        GrassCastsShadows            "0"
        EnvironmentMapCacheSize "256"
        LPVEdgeBlending "0"

    }

    SceneSystem
    {

        HairShading                  "false"
        ParticleBufferSize           "256"
        DisableLateAllocatedTransformBuffer         "1"         
        DynamicShadowResolution                     "1"        
        FogCachedShadowAtlasHeight                  "0"     
        FogCachedShadowAtlasWidth                   "0"         
        FogCachedShadowTileSize                     "0"        
        FrameBufferCopyFormat                       "R11G11B10F" 
        GpuLightBinner                              "1"        
        GpuLightBinnerSunLightFastPath              "1"         
        GpuLightBinnerSupportViewModelCascade       "0"
        HDRFrameBuffer                              "0"
        LayerBatchThresholdFullsort                 "80"    
        MinimumLateAllocatedVertexCacheBufferSizeMB "64"    
        NonTexturedGradientFog                      "0"     
        SunLightManagerCount                        "0"     
        SunLightManagerCountTools                   "0"     
        SunLightMaxCascadeSize                      "2"    
        SunLightShadowRenderMode                    "Depth" 
        SupportsInstancedFade                       "0"
        Tonemapping                                 "0"   
        TransformTextureRowCount                    "1024" 
        TransformTextureRowCountToolsMode           "6144" 
        VolumetricFog                               "0"    
        GpuLightBinnerBinEnvMaps "1"
        GpuLightBinnerBinLPVs    "1"
        LightCookieAllocGranularity "1"
        LightCookieMinAllocSize     "0"
        DisableShadowFullSort       "1"
        SparseShadowTrees           "1" 
        PointLightShadowsEnabled    "1"
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
        features        "animgraph;modelconfig;gamepreview;wireframe_backfaces;distancefield"
    }

    Particles
    {
        EnableParticleShaderFeatureBranching "1"
        Float16HDRBackBuffer                 "1"
        PET_SupportFadingOpaqueModels        "1"
        Features                             "non_homogenous_forward_layer_only"
        ParticlesFoggedByDefault             "0"
        PerVertexLighting                    "0"
        GpuImplicitRendererManifest          "1"
        EnableMixedResolution                "1"
    }


    ConVars
    {	 

// ====== GAMEINFO CONFIG — DYSON EDITION ==============
//                                                     =        
//           ...       ....                            =        
//        ...   ..   ..    ...                         =        
//       .        . .  o      .                        =       
//      .          .           .                       =       
//      . o      /\_/\    o    .                       =       
//      .       / o o \       .                        =       
//     o .     ( >  v< )      .                        =       
//        .     \ === /    o                           =       
//          .    )   (                                 =       
//      o      _/     \_       o                       =       
//            / |     | \                              =       
//           /  |     |  \                             =       
//      o   '---'     '---'    o                       =       
//                                                     =       
// ......................................................
//                                                     =                                             
//   gameinfo performance config for Deadlock          =      
//                                                     =       
//   . threading optimized                             =       
//   . network stack tuned                             =       
//   . rendering stripped to essentials                =       
//   . physics & LOD configured                        =       
//                                                     =       
//   Updated: 03.06.2026                               =       
//                                                     =       
// =====================================================


// ==================== СИСТЕМА И МНОГОПОТОЧНОСТЬ ====================
host_thread_mode "1"
r_threaded_particles "1"
r_threaded_renderables "1"
r_threaded_shadow_clip "1"
r_threaded_scene_object_update "1"
r_threaded_particle_creation "1"
cl_threaded_bone_setup "1"
cl_threaded_client_leaf_system "1"
cl_threaded_bvs "1"
cl_bone_cache_optimization "1"
sc_layer_batch_threshold_fullsort "20"
sc_cache_envmap_lpv_lookup "false" // Отключает кэш LPV окружения — экономия памяти
r_queued_post_processing "1" // Постобработка в отдельной очереди — стабильнее
engine_no_focus_sleep "20"
fps_max "0" // Неограниченный FPS
mat_queue_mode "2" // Многопоточный режим шейдеров
mat_async_shader_load "1" // Асинхронная загрузка шейдеров
cl_parallel_readpacketentities "1" // Параллельное чтение пакетов сущностей
phys_multithreading_enabled "1" // Многопоточная физика
animgraph2_enable_parallel_update "1" // Параллельное обновление анимграфа
animgraph_parallel_postdataupdate "1" // Параллельное post-data-update
animgraph_enable_dirty_netvar_optimization "1" // Пропускает неизменённые netvar'ы — меньше нагрузки на CPU
parallel_perform_invalidate_physics "true" // Параллельная инвалидация физики
parallel_update_surrounding_bounds_in_spatial_partition_update "1" // Параллельное обновление границ
thread_pool_option "-1"
enable_priority_boost "true"
nav_obstruction_async_update "true"

// ==================== СЕТЬ ====================
cl_updaterate "128" // Обновления с сервера 128 раз в секунду
cl_cmdrate "128" // Команды игрока 128 раз в секунду
cl_interp "0.03125" // Интерполяция 31.25ms — минимальная задержка
cl_interp_ratio "2" // Интерполяция на 2 тика
cl_maxpackets "256" // Максимум пакетов в секунду
cl_predict "1" // Включает предсказание движения
cl_predictweapons "1" // Предсказание оружия
cl_lagcompensation "1" // Компенсация лага
net_maxcleartime "0.005" // Минимальное время очистки сети
net_maxroutable "1200" // Максимальный размер маршрутизируемого пакета
net_splitpacket_maxrate "30000" // Максимальная скорость для разделённых пакетов
cl_clock_buffer_ticks "1" // Буферизация тиков часов
sv_lagcomp_filterbyviewangle "false" // Не фильтровать лаг-компенсацию по углу обзора
sv_maxunlag_player "0.200" // Максимум 200ms для антилага
cl_pred_optimize "1" // Оптимизация предсказания
cl_pred_parallel_postnetwork "1" // Параллельное постсетевое предсказание
cl_skip_hierarchy_update_for_unchanged_entities "1" // Пропускает обновления неизменённых сущностей
sv_parallel_packentities "2" // Параллельная упаковка сущностей
cl_parallel_readpacketentities_threshold "2" // Порог для параллельного чтения пакетов
net_async_clientconnect "1" // Асинхронное подключение клиента
rate "786432" // Максимальная скорость передачи данных
cl_async_usercmd_send "true"
cl_async_usercmd_send_disabled_recvmargin_min "0.5"
cl_tickpacket_desired_queuelength "0"
cl_tickpacket_recvmargin_desired "5"
cl_prediction_savedata_postentitypacketreceived "1"
cl_smooth "0" // Отключает сглаживание движения
cl_smoothtime "0.01"
cl_smooth_draw_debug "0"
cl_interp_parallel "true"
cl_batch_entity_list_ops_during_latch "true"
cl_modifier_parallel_gather_status_effect_updates "true"
cl_phys_assume_fixed_tick_interval "false"

// ==================== ОСНОВНЫЕ НАСТРОЙКИ ГРАФИКИ ====================
gpu_level "1" // Уровень GPU на минимум
cpu_level "1" // Уровень CPU на минимум
mat_set_shader_quality "0" // Качество шейдеров на минимум
r_aspectratio "2.1" // Соотношение сторон
citadel_camera_hero_fov "100" // FOV (поле зрения)
zoom_sensitivity_ratio "0.8" // Чувствительность мыши при зуме
r_fastzreject "-1" // Быстрое отклонение Z-буфера
r_norefresh "1" // Отключает обновление экрана между кадрами
r_dynamic "0" // Отключает динамическое обновление сцены
r_citadel_antialiasing "0" // Отключает антиалиасинг
citadel_video_preset "2"
r_force_zprepass "0"
r_frame_sync_enable "false"
r_vma_defrag_algorithm "0"
rtx_dynamic_blas "false"
rtx_dynamic_blas_caching "false"
rtx_force_default_hitgroup "true"
rtx_texture_resolution "64"
r_renderdoc_auto_shader_pdbs "false"
sc_force_materials_batchable "true"
sc_aggregate_render_mesh_shader "false"
sc_aggregate_rtproxy_instanced_geo "false"
sc_aggregate_rtproxy_unique_geo "false"
sc_instanced_mesh_opaque_fade "false"
r_skip_precache_validation_check "true"
r_async_compute_fog "true"
r_update_particles_on_render_only_frames "true"

// ==================== ТЕНИ И ОСВЕЩЕНИЕ ====================
r_shadows "0" // Отключает все тени
r_dynamic_shadows "0" // Отключает динамические тени
r_shadowrendertotexture "0" // Отключает рендер теней в текстуру
r_shadowmaxrendered "0" // Максимум теней = 0
r_rendersun "0" // Отключает рендер солнца
r_citadel_shadow_quality "0" // Качество теней Citadel на минимум
r_citadel_shadowdb "256" // Размер shadow depth bias
r_citadel_sun_shadow_slope_scale_depth_bias "1.0"
r_citadel_gpu_culling_shadows "1" // GPU куллинг для теней
cl_retire_low_priority_lights "1" // Удаляет низкоприоритетные источники света
r_cull_duplicate_shadows "1" // Удаляет дублирующиеся тени
r_cull_shadowcasters_using_bounds "1" // Куллит источники теней по границам
csm_max_shadow_dist_override "0" // Переопределение максимальной дистанции CSM
r_size_cull_threshold_shadow "100" // Порог размера для куллинга теней
lb_enable_shadow_casting "0" // Отключает рендер теней
lb_csm_draw_alpha_tested "0"
lb_csm_draw_translucent "0"
lb_barnlight_shadowmap_scale "0.5"
lb_csm_cascade_size_override "1"
lb_dynamic_shadow_resolution_quantization "32"
lb_csm_override_staticgeo_cascades_value "0"
lb_csm_receiver_plane_depth_bias "0.00002"
lb_csm_receiver_plane_depth_bias_transmissive_backface "0.0002"
lb_sun_csm_size_cull_threshold_texels "30"
lb_dynamic_shadow_resolution_base "256"
sparseshadowtree_enable_rendering "0" // Отключает рендеринг sparse shadow tree
sparseshadowtree_disable_for_viewmodel "1"
lb_enable_lights "0" // Отключает динамическое освещение
lb_enable_sunlight "false" // Отключает освещение от солнца
lb_enable_baked_shadows "0" // Отключает запечённые тени
lb_enable_dynamic_lights "0" // Отключает динамические источники света
lb_enable_stationary_lights "0"
citadel_portrait_world_renderer_off "0"
lb_max_visible_barn_lights_override "1"
lb_ssss_samples "0" // Отключает subsurface scattering
lb_max_visible_envmaps_override "4"
lb_enable_fog_mixed_shadows "0"
lb_csm_cross_fade_override "0"
lb_csm_distance_fade_override "0"
r_directlighting "0" // Отключает прямое освещение
r_ssao "0" // Отключает Screen Space Ambient Occlusion
r_ssao_strength "0"
r_citadel_ssao_bent_normals "false"
r_citadel_ssao_denoise_passes "0"
r_citadel_ssao_quality "0"
r_citadel_ssao_radius "0"
r_citadel_ssao_thin_occluder_compensation "0"
r_ssao_blur "0"
r_occlusion "1" // Включает occlusion culling
r_occlusion_culling "1" // GPU occlusion culling
r_maxdlights "0" // Максимум динамических источников света = 0
mat_disable_lightwarp "1" // Отключает lightwarp для персонажей
r_citadel_npr_outlines "0" // Отключает NPR контуры
sc_disable_shadow_fastpath "0"
sc_disable_shadow_materials "1" // Отключает теневые материалы
sc_disable_spotlight_shadows "1" // Отключает тени спотлайтов
cl_globallight_shadow_mode "0"
r_directional_lightmaps "false"
r_lightmap_size_directional_irradiance "0"
r_lightmap_bicubic_filtering "1"
r_lightmap_size "4"
sc_disable_baked_lighting "true" // Отключает запечённое освещение
r_multiscattering "1"
r_shadow_half_resolution "1"
r_shadowlod "0"
r_light_static "0"
r_lightaverage "0"
r_worldlights "0"
r_worldlightmin "0.0001"
r_hunkalloclightmaps "0"
r_light_flickering_enabled "false" // Отключает мигание света
r_light_sensitivity_mode "true"
lb_dynamic_shadow_resolution "false"
lb_dynamic_shadow_penumbra "false"
lb_mixed_shadows "false"
lb_barnlight_shadow_use_precomputed_vis "0"
lb_cubemap_normalization_max "1"
lb_cubemap_normalization_roughness_begin "0.01"
r_cubemap_normalization "1"
r_environment_map_roughness_range "0.01"
mat_disable_phong "1" // Отключает Phong шейдеры
mat_disable_rimlight "1" // Отключает rim lighting
mat_hdr_level "0" // Отключает HDR
mat_tonemapping_occlusion_use_stencil "0"
mat_force_bloom "0"
mat_force_tonemap "0"
mat_colcorrection_disableentities "0"
sc_hdr_enabled_override "0"
r_use_memory_budget_model "true"
gpu_mem_level "0"

// ==================== ЧАСТИЦЫ ====================
r_drawparticles "1" // Включает рендер частиц (ДОЛЖНЫ БЫТЬ ВКЛЮЧЕНЫ для видимости способностей!)
r_farz "6000" // Дистанция видимости объектов
cl_particle_max_count "1500" // Максимум частиц на экране
cl_particle_budget "0" // Бюджет частиц = нет ограничений
cl_particle_batch_mode "1" // Батчинг частиц
r_particle_low_res_render "1" // Низкоразрешающий рендер частиц
r_particle_lighting_enable "0" // Отключает освещение частиц
r_particle_shadows "0" // Частицы не отбрасывают тени
r_particle_cables_cast_shadows "0"
r_particle_max_detail_level "1"
cl_particle_fallback_base "10"
cl_particle_fallback_multiplier "20"
r_particle_max_size_cull "700"
r_particle_radius_cull "1" // Куллинг частиц по радиусу
r_particle_skip_update "0"
r_particle_update_rate "0"
r_particle_timescale "1"
r_particle_sim_spike_threshold_ms "5"
r_RainParticleDensity "0" // Отключает дождь
particle_cluster_nodraw "1"
cl_aggregate_particles "true"
r_wait_on_fence "0"
cl_max_particle_pvs_aabb_edge_length "1000"
r_particle_cables_render "true" // Оставить включённым — нужно для ульты Lash
r_particle_max_draw_distance "300000"
r_particle_enable_fastpath "1"
r_particle_gpu_implicit "1" // GPU-имплицитные частицы
r_particle_mixed_resolution_viewstart "16"
r_particle_model_new "false"
r_particle_model_new8 "false"
r_particle_skip_postsim "true"
r_limit_particle_job_duration "true"
r_particle_min_timestep "0.001"
r_particle_allowprerender "false"
r_particle_cables_culling "1"
r_particle_batch_collections "true"
r_particle_cables_render_meshlets "false"
r_particle_debug_filter ""
r_physics_particle_op_spawn_scale "0"
cl_particle_sim_fallback_base_multiplier "40"
cl_particle_sim_fallback_threshold_ms "1"
cl_show_splashes "0" // Отключает всплески
mat_reduceparticles "1"
r_draw_particle_children_with_parents "0"
r_meshlet_culling "1" // Куллинг мешлетов — меньше draw calls
r_hzb_occlusion "1" // HZB occlusion — меньше овердро
r_batch_draw_calls "1" // Батчинг draw calls
r_visibility_framelag "1" // Стабильность кадров
r_late_particle_job_sync "true"
r_particle_fixedrandomseeds "true"
r_particle_max_texture_layers "4"
r_particle_model_per_thread_count "64"
r_citadel_screenspace_particles_full_res "false"
particle_cluster_use_collision_hulls "false"

// ==================== МОДЕЛИ, LOD И КУЛЛИНГ ====================
r_rootlod "3" // Root LOD — более агрессивный лод
r_lod "3" // LOD агрессивнее
r_size_cull_threshold "1.2" // Пороговый размер для куллинга
r_size_cull_threshold_fade "0"
r_entity_cull_distance_multiplier "3.0" // Увеличивает дистанцию куллинга сущностей
r_cullforperformance "1"
r_gpu_cull "1" // GPU куллинг
r_gpu_cull_models "1" // GPU куллинг моделей
r_gpu_cull_models_range "2500"
r_propsmaxdist "1000" // Максимальная дистанция рендера props
r_model_lighting_simplified "1" // Упрощённое освещение моделей
cl_fasttempentcollision "20"
skeleton_instance_lod_optimization "1"
enable_boneflex "false"
r_eyes "0" // Отключает рендер глаз персонажей
r_teeth "0" // Отключает рендер зубов
cl_disable_ragdolls "true" // Отключает ragdoll'ы
cl_ragdoll_limit "0"
cl_jiggle_bone_framerate_cutoff "0"
g_debug_ragdoll_visualize "0"
g_ragdoll_fadespeed "999"
g_ragdoll_important_maxcount "0"
g_ragdoll_lifetime "0"
ragdoll_lru_debug_removal "0"
ragdoll_parallel_pose_control "1"
r_drawentities "1"
r_draw_entities "1"
r_render_hair "0" // Отключает рендер волос
r_skinning_enabled "1"
r_strip_invisible_during_sceneobject_update "1"
sc_mesh_backface_culling "1"
sc_instanced_mesh_enable "1"
sc_instanced_mesh_gpu_culling "1"
sc_aggregate_gpu_culling "1"
r_allow_onesweep_gpusort "1"
update_all_keyframed_in_spatial_partition_update "1"
always_perform_full_spatial_partition_update "0"
r_haircull_percent "100"
r_hair_ao "0"
r_hair_indirect_transmittance "0"
r_hair_meshshader "0"
r_hair_shadowtile "0"
r_force_thick_hair "0"
r_morphing_enabled "false"
r_smooth_morph_normals "0"
r_enable_rigid_animation "1"
sc_instanced_mesh_lod_bias "15"
sc_instanced_mesh_lod_bias_shadow "10"
sc_instanced_mesh_size_cull_bias "10"
sc_instanced_mesh_size_cull_bias_shadow "10"
sc_instanced_mesh_motion_vectors "0"
sc_instanced_mesh_mesh_shader "false"
sc_fade_distance_scale_override "180"
sc_clutter_enable "0"
sc_clutter_density_none_size "0.1"
sc_clutter_density_full_size "0.5"
sc_aggregate_bvh_threshold "16"
sc_layer_batch_threshold "16"
sc_screen_size_lod_scale_override "0.01"
sc_allow_dithered_lod "0"
sc_dithered_lod_transition_amt "0"
sc_allow_dynamic_constant_batching "1"
sc_aggregate_gpu_culling "1"
r_citadel_gpu_culling "1" // GPU куллинг геометрии Citadel
r_citadel_gpu_culling_two_pass "1"
r_citadel_gpu_culling_shadows "1"
r_citadel_depth_prepass_cull_threshold "60"
r_citadel_depth_prepass_dynamic_objects "1"
r_citadel_distancefield_farfield_enable "false"
r_citadel_distancefield_blur "false"
r_citadel_distancefield_shadows "false"
r_citadel_distancefield_down_sample "6"
r_distancefield_enable "false"
r_citadel_npr_outlines_max_dist "600"
r_citadel_npr_force_solid_outline "false"

// ==================== ТЕКСТУРЫ, ПОТОКОВАЯ ЗАГРУЗКА И ШЕЙДЕРЫ ====================
r_texture_streaming "1"
r_texture_stream_pool_budget "8"
r_texture_stream_lowres_drop_rate "99"
r_texture_stream_mip_skip "15"
r_texture_stream_mip_bias "3"
r_texture_stream_use_only_streamable "1"
r_render_view_scale "0.001"
mat_picmip "100" // Агрессивное снижение качества мипмапов
r_texture_pool_size "1024"
r_texture_lod_scale "0"
r_texture_stream_resolution_bias "0.001"
mat_viewportscale "0.05"
r_texture_filter_textures "0"
r_texturefilteringquality "0"
mat_mip_linear "0"
mat_trilinear "0"
mat_disable_fancy_blending "1"
mat_reducefillrate "1"
csm_cascade0_override_dist "0"
csm_cascade1_override_dist "0"
csm_cascade2_override_dist "0"
csm_cascade3_override_dist "0"
csm_max_dist_between_caster_and_receiver "0"
csm_max_num_cascades_override "2"
csm_max_shadow_dist_override "1" // Переопределение максимальной дистанции CSM
csm_max_visible_dist "0"
csm_res_override_0 "1"
csm_res_override_1 "1"
csm_res_override_2 "1"
csm_res_override_3 "1"
csm_viewmodel_shadows "false"
animated_material_attributes "false"
r_texture_eager_eviction "0"
r_mipgen_compute_shader "1"
r_cache_pool_allocations "1"
r_texture_nonstreaming_load "1" // Немедленная загрузка mip без стриминга — меньше фризов
r_texture_hookup_uses_threadpool "1" // Подключение текстур через пул потоков
r_vulkan_sw_cmd_lists "1" // Программные списки команд Vulkan — стабильный тайминг кадров
r_dx11_software_cmd_lists "1" // Программные списки команд DX11

// ==================== ФИЗИКА, ПРОПЫ И ДЕКАЛИ ====================
cl_phys_timescale "1"
cl_phys_sleep_enable "true"
cl_phys_props_max "0"
cl_phys_props_enable "0"
cl_phys_networked_start_sleep "true"
r_drawdecals "true"
r_decals "1"
r_queued_decals "0"
r_drawmodeldecals "0"
r_character_decal_resolution "1"
r_character_decal_monitor_render_res "64"
r_character_decal_monitor_draw_frustum "0"
r_character_decal_monitor_emissive "0"
r_character_decal_renderdoc_capture "0"
r_reset_character_decals "0"
r_maxmodeldecal "0"
r_decals_max_on_deformables "0"
r_decals_overlap_threshold "5"
r_decals_default_fade_duration "1"
r_depth_of_field "0"
r_effects_bloom "0"
r_post_bloom "0"
cloth_update "1"
cloth_sim_on_tick "0"
cloth_filter_transform_stateless "0"
citadel_breakable_prop_breakable_enabled "1"
props_break_max_pieces_perframe "0"
func_break_max_pieces "1"
phys_dynamic_scaling "false"
phys_log_updaters "0"
phys_powered_ragdoll_debug "0"
phys_show_stats "0"
phys_visualize_traces "0"
phys_threaded_cloth_bone_update "1"
phys_threaded_kinematic_bone_update "1"
phys_threaded_transform_update "1"
phys_expensive_shape_threshold "100"
phys_cull_internal_mesh_contacts "true"
phys_highlight_expensive_objects_strength "0"
presettle_cloth_iterations "0"
pred_cloth_pos_max "0"
pred_cloth_pos_multiplier "0"
pred_cloth_pos_strength "0"
pred_cloth_rot_high "0"
pred_cloth_rot_low "0"
pred_cloth_rot_multiplier "0"
ai_force_serverside_ragdoll "1"
rope_collide "0"
rope_subdiv "0"
rope_wind_dist "0"
rope_smooth_enlarge "0"
rope_smooth_maxalpha "0"
rope_smooth_maxalphawidth "0"
rope_smooth_minalpha "0"
rope_smooth_minwidth "0"
r_ropetranslucent "0"
r_drawropes "0"

// ==================== АТМОСФЕРА И ВОДА ====================
r_drawskybox "true"
r_draw3dskybox "0"
r_monitor_3dskybox "0"
r_fog_enable "false"
r_enable_volume_fog "0"
r_enable_gradient_fog "0"
r_enable_cubemap_fog "0"
r_citadel_fog_quality "0"
volume_fog_intermediate_textures_hdr "false"
r_drawwater "0" // Отключает воду
r_waterforceexpensive "0"
r_cheapwaterstart "0"
r_cheapwaterend "1"
mat_disable_water "1"
sv_waterdist "0"
r_grass_quality "0" // Отключает траву
r_grass_start_fade "0"
r_grass_end_fade "0"
r_grass_allow_flattening "0"
r_grass_density_mode "0"
r_grass_vertex_lighting "0"
r_debug_precipitation "0"
r_world_wind_strength "0"
r_world_wind_frequency_grass "0"
r_world_wind_frequency_trees "0"
thumper_use_plane_reflection "false"

// ==================== ПОСТОБРАБОТКА И ПРОЧЕЕ ====================
mat_postprocess_enable "0" // Отключает постобработку
mat_dynamic_tonemapping "0"
mat_auto_reduce_quality "1"
mat_auto_reduce_materials "1"
mat_disable_bloom "1" // Отключает bloom
mat_disable_bands "1"
mat_disable_software_led "1"
mat_disable_distortion "1"
mat_disable_fancy_alpha "1"
mat_colorcorrection "1" // Коррекция цвета
mat_motion_blur_enabled "0" // Отключает motion blur
r_citadel_motion_blur "0"
r_lensflare "0" // Отключает линзовые блики
r_screenoverlay "0"
r_filmgrain "0" // Отключает зерно плёнки
r_citadel_depthoffield_enable "false"
mat_tonemap_bloom_scale "0"
mat_force_bloom "0"
mat_force_tonemap "0"
mat_max_lighting_complexity "1"
r_muzzleflashbrightness "0.01" // Минимальная яркость вспышки от оружия
r_citadel_enable_pano_world_blur "true"
r_dof_override "0"
r_flashlightambient "0"
r_flashlightbrightness "0"
r_flashlightfar "0"
r_flashlightfov "90"
r_flashlightlinear "0"
r_flashlightshadowatten "0"
r_flashlightlockposition "0"
r_flashlightvisualizetrace "0"

// ==================== ГЕЙМПЛЕЙ, ИНТЕРФЕЙС И ЭФФЕКТЫ ====================
r_drawtracers "1" // Включает трассеры пуль
r_drawtracers_firstperson "1"
cl_show_bloodspray "0" // Отключает брызги крови
cl_show_splashes "0" // Отключает всплески
cl_ejectbrass "0" // Отключает выброс гильз
cl_playerspraydisable "1" // Отключает спреи игроков
citadel_damage_indicator "0" // Отключает индикатор урона
citadel_damage_overlay "0"
citadel_damage_screen_effects "0"
citadel_post_damage_vignette "0"
citadel_show_new_damage_feedback_numbers "0"
citadel_hud_objective_health_enabled "2"
citadel_boss_glow_disabled "1" // Отключает свечение боссов
citadel_hideout_ball_show_juggle_count "1"
citadel_hideout_ball_show_juggle_fx "1"
citadel_unit_status_use_new "1"
citadel_use_vertical_healthbars "0"
citadel_trooper_glow_disabled "1"
citadel_trooper_friendly_glow_disabled "true"
citadel_trooper_outline_enabled "false"
r_citadel_outlines "1" // Включает контуры для игроков
citadel_enemy_glow_enabled "0"
citadel_player_glow_disabled "0"
citadel_damage_report_enable "1"
citadel_damage_text_show_effectiveness "0"
citadel_death_replay_enabled "0"
citadel_damage_offscreen_indicator_disabled "true"
citadel_damage_text_lifetime "1.5"
citadel_damage_text_lifetime_new "0.75"
citadel_damage_text_lifetime_accumulated_new "2"
citadel_damage_text_batching_window_ability "1000"
spec_replay_enable "0"
citadel_camera_wobble_disable "1" // Отключает тряску камеры
citadel_camera_soft_collision "0"
citadel_camera_use_vmdl_flatten_horizontal "false"
citadel_camera_use_vmdl_flatten_vertical "false"
citadel_camera_soft_collision_angle "360"
citadel_crosshair_hit_marker_duration "0.00001"
citadel_player_outline_fade_range_min "inf"
citadel_player_outline_fade_range_max "-inf"
citadel_outer_radius_scaler "0.25"
citadel_use_pvs_for_players "true"
citadel_unit_status_delta_decay_rate "2"
citadel_unit_status_allies_see_thru_walls "true"
citadel_unit_status_allies_see_thru_walls_max_distance "40"
citadel_show_chat_wheel_angle_threshold "0"
citadel_player_outline_enemies "false"
mp_fadetoblack "1"
mp_allowspectators "0"
panorama_disable_box_shadow "1" // Отключает тени интерфейса
panorama_disable_blur "1"
panorama_disable_parallax "1"
panorama_disable_text_shadow "1"
panorama_disable_animations "1"
panorama_allow_transitions "false"
panorama_async_compute_mipgen "1"
r_dashboard_render_quality "0"
panorama_max_fps "30"
panorama_max_overlay_fps "30"
panorama_classes_perf_warning_threshold_ms "0.75"
panorama_disable_render_target_cache "0"
panorama_js_minidumps "1"
panorama_joystick_enabled "0"
panorama_skip_composition_layer_content_paint "1"
panorama_transition_time_factor "2"
panorama_use_new_occlusion_invalidation "1"
panorama_temp_comp_layer_min_dimension "128"
sc_max_framebuffer_copies_per_layer "0"
r_drawviewmodel "0" // Отключает модель оружия
bullet_tracer_path_debug "0"
r_citadel_selection_outline2_offset "1"
r_citadel_selection_outline2_alpha "0.2"
r_citadel_selection_outline2_fade_pow "-inf"
cl_glow_brightness "0"
r_citadel_fsr2_sharpness "0.2"
r_citadel_fsr_enable_mip_bias "1"
r_citadel_fsr_rcas_sharpness "0.2"
hud_free_cursor "0"
mm_idle_enabled "false"
mm_idle_show_warning_at_s "999"
r_citadel_clip_sphere_min_opacity "0"
steam_inputhandler_enabled "true"

// ==================== ИИ И АНИМАЦИЯ ====================
ai_disabled "0"
ai_expression_optimization "1"
ai_strong_optimizations_no_checkstand "1"
ai_use_visibility_cache "1"
ai_foot_sweep_enable "false"
ai_gather_conditions_async "true"
ai_force_serverside_ragdoll "1"
citadel_bot_brain_disable_attacks "1"
citadel_bot_brain_disable_movement "1"
citadel_npc_force_animate_every_tick "false"
cl_simulate_dormant_entities "false"
animgraph_draw_traces "0"
animgraph_enable "1"
animgraph_enable_parallel_op_evaluation "1"
animgraph_enable_parallel_preupdate "1"
animgraph_enable_parallel_update "1"
animgraph_record_all "0"
citadel_ag2_controller_parallel_update_enabled "1"
citadel_player_anim_debug "0"
citadel_player_debug_animgraph_movement "0"
anim_decode_forcewritealltransforms "true"
animgraph_footlock_enabled "false"
animgraph_footlock_ik_enable "0"
animgraph_slowdownonslopes_enabled "false"
ik_fabrik_align_chain "0"
ik_final_fixup_enable "0"
learning_rate "0.1"
modifier_aura_debug "0"
think_limit "10"
zipline_use_new_latch "0"
update_voices_low_priority "true"
nav_pathfind_multithread "1"
iv_parallel_latch "1"
iv_wrapped_parallel_latch "1"
iv_parallel_restore "false"
ai_lod_auto_enabled "true"

// ==================== ЗВУК ====================
audio_relevance_debug_enabled "0"
citadel_enable_vdata_sound_preload "true"
disable_source_soundscape_trace "true"
reset_voice_on_input_stallout "0"
snd_envelope_rate "100.0"
snd_event_cone_debug "0"
snd_occlusion_debug "0"
snd_report_audio_nan "1"
snd_sos_max_event_base_depth "10"
snd_sound_areas_debug "0"
snd_soundmixer_update_maximum_frame_rate "0"
snd_steamaudio_active_hrtf "0"
snd_steamaudio_enable_custom_hrtf "0"
snd_steamaudio_enable_pathing "0"
snd_steamaudio_invalid_path_length "0.0"
snd_steamaudio_ir_duration "1.0"
snd_steamaudio_load_pathing_data "0"
snd_steamaudio_load_reverb_data "0"
snd_steamaudio_reverb_update_rate "10.0"
snd_ui_positional "false"
snd_ui_spatialization_spread "2.4"
sos_use_guid_filter "1"
soundscape_radius_debug "0"
voice_in_process "1"
voice_input_stallout "0.5"
audio_enable_vmix_mastering "false"
snd_mix_async "1"
soundscape_update_include_bots "0"
snd_steamaudio_enable_reverb "0"
snd_steamaudio_num_threads "4"
snd_occlusion_rays "0"
snd_occlusion_bounces "0"
snd_use_baked_occlusion "1"
snd_mixahead "0.05"
run_voicecontainer_async "1"
soundsystem_update_async "1"
dsp_volume "0"
volume "0.01"
snd_soundmixer_version "1"
snd_steamaudio_reverb_order_rendering "0"

// ==================== МИНИКАРТА ====================
citadel_minimap_draw_fow "0"
citadel_minimap_show_hitboxes "0"
citadel_minimap_use_canvas_for_neutrals "0"
citadel_minimap_use_canvas_for_shop "0"
citadel_minimap_use_effects "0"
minimap_update_rate_hz "30"

// ==================== ПРОЧЕЕ И ОТЛАДКА ====================
citadel_bullet_log_entities_hit "0"
citadel_bullet_tracer_recycling_enabled "1"
citadel_bullet_time_warp_decay_percent "1"
citadel_movement_debugdraw "0"
citadel_per_weapon_per_surface_impact_effects "false"
cq_buffer_bloat_msecs_max "120"
citadel_perf_interval_report_s "100000"
cl_frametime_summary_report_detailed "false"
cc_captiontrace "0"
imgui_debug_draw_dashboard_window "0"
imgui_enable "0"
imgui_enable_input "0"
imgui_temp_enable "0"
r_citadel_gpu_debug_draw "0"
r_drawdevvisualizers "0"
show_visibility_boxes "0"
cl_usesocketsforloopback "1"
cl_physics_highlight_active "0"
r_suppress_redundant_state_changes "1"
r_vma_defrag_enabled "1"
r_dopixelvisibility "true"
r_pixelvisibility_partial "false"
r_pixelvisibility_spew "0"
r_drawpixelvisibility "0"
r_drawblankworld "0"
r_lighting_only "0"
r_opaque "1"
r_translucent "1"
r_render_portals "1"
r_low_latency "1" // NVIDIA Low Latency / AMD Anti-Lag 2
r_arealights "false"
r_citadel_render_game "1"
r_draw_instances "1"
r_add_views_in_pre_output "0"
r_always_render_all_windows "0"
r_allow_low_gpu_memory_mode "1"
r_experimental_lag_limiter "0"
r_show_gpu_memory_visualizer "0"
r_showdebugrendertarget "0"
r_showsunshadowdebugrendertargets "0"
r_showsunshadowdebugsplitvis "0"
r_shadowtile_waveops "0"
r_debug_draw_safe_area_insets "0"
r_cubemap_debug_colors "0"
r_citadel_clip_sphere_min_opacity "0"
r_mapextents "8192"
mesh_calculate_curvature_smooth_pass_count "0"
sv_pvs_max_distance "2800"
sv_remove_ent_from_pvs "1"
sv_hide_ent_in_pvs "1"
fs_async_threads "8"
r_particle_model_new "false"
r_particle_model_new8 "false"
sc_enable_discard "true"
lb_precomputed_shadowmap_enable "0"
lb_shadow_map_cull_empty_mixed "true"
vis_sunlight_enable "0"
r_particle_model_per_thread_count "64"
ai_think_interval "0.3"
ai_async_queue_max_jobs "8"
ai_think_interval_lod_med "0.4"
ai_think_interval_lod_low "1"
wind_system_temporal_smoothing "false"
wind_system_default_resolution_xy "64"
g_ragdoll_maxcount "1"
r_texture_stream_max_resolution "1024"
r_RainAllowInSplitScreen "0"
battery_saver "0"
r_particle_cables_render_meshlets "false"
r_max_portal_render_targets "2"
r_fullscreen_gamma "1.4"
r_farz "8192" // Дистанция видимости объектов
engine_low_latency_sleep_after_client_tick "true"
engine_max_ticks_to_simulate "2"
save_parallel "true"
r_citadel_mboit_enabled "0"

// ==================== ВВОД ====================
m_rawinput "1" // Сырой ввод мыши
cl_input_enable_raw_keyboard "1"
m_filter "0" // Отключает сглаживание мыши
input_virtualization_block_mouse "1"
cl_joystick_enabled "0" // Отключает джойстик
in_button_double_press_window "0.3"

// ==================== ПАМЯТЬ И КОНВЕЙЕР ====================
r_pipeline_stats_present_flush "0"
r_pipeline_stats_command_flush "0"
r_async_shader_compile_notify_frequency "999"
r_texture_budget_dynamic "1"
r_texture_budget_threshold "0.7"
r_texture_budget_update_period "0.5"
r_texture_pool_reduce_rate "512"

// ==================== НАСИЛИЕ И ЭФФЕКТЫ ====================
violence_hblood "0" // Отключает кровь
violence_ablood "0"
cl_burninggibs "0"
violence_hgibs "0"
violence_agibs "0"
cl_impacteffects "0"
cl_eye_yaw_multiplier "0"
sv_footsteps "0"
sv_voiceenable "0"
fx_drawmetalspark "false"
r_fallback_texture_lod_scale "0"
r_citadel_disable_npr_lighting "false"
r_citadel_npr_outlines "false" // Отключает NPR контуры

// ==================== КОНСОЛЬ ====================
con_enable "1"
con_filter_enable "1"
closecaption "false"

// ============================================================
//                                                            
//   . o      .       .      o .      .       .      o .  
//   .      .    . o    .  .      .      . o    .  .      
//                                                            
//   .   zzz...          .            ...zzz    .          
//   . o  /\_/\   .   o    .    . o   /\_/\  o    .       
//   .   ( -.- )    .    .    .      ( -.- )  .   .   .   
//  o .   \ ~ /  o    .    o    .     \ ~ /     o    .  o 
//     .   )=(      .    .    .    .   )=(   .    .    .  
//   .    '---'  .    o    .    .     '---' .    o    .   
//                                                            
//      .      .    . o    .  .      .      . o    .  .      
//      . o      .       .      o .      .       .      o .  
//                                                            
//       see you next patch  ~  dyson edition            
//                                                            
// ================ END OF CONFIG ============================



    rate
        {
            min     "98304"
            default "786432"
            max     "1000000"
        }
        sv_minrate                   "98304"
        sv_maxunlag                  "0.500"
        sv_maxunlag_player           "0.200"
        sv_lagcomp_filterbyviewangle "false"

        panorama_classes_perf_warning_threshold_ms "0.75"
        panorama_js_minidumps "1"
        panorama_disable_render_target_cache "0"
        panorama_skip_composition_layer_content_paint "1"

        snd_steamaudio_load_reverb_data  "0"
        snd_steamaudio_load_pathing_data "0"
        snd_steamaudio_enable_custom_hrtf  "0"
        snd_steamaudio_active_hrtf         "0"
        snd_steamaudio_reverb_update_rate  "10.0"
        snd_steamaudio_ir_duration         "1.0"
        snd_steamaudio_enable_pathing      "0"
        snd_steamaudio_invalid_path_length "0.0"
        cl_disconnect_soundevent           "citadel.convar.stop_all_game_layer_soundevents"
        snd_event_browser_default_stack    "citadel_default_3d"
        voice_in_process "1"
        snd_sos_max_event_base_depth "10"
        sos_use_guid_filter          "1"

        voice_always_sample_mic
        {
            version "2"
            default "0"
        }

        reset_voice_on_input_stallout "0"
        voice_input_stallout          "0.5"
        cl_usesocketsforloopback      "1"
        cl_poll_network_early         "0"
        iv_parallel_restore "1"
        disable_source_soundscape_trace "1"
        cl_tickpacket_recvmargin_desired              "5"   
        cl_tickpacket_desired_queuelength             "0"   
        cl_async_usercmd_send_disabled_recvmargin_min "0.5" 
        cl_clock_buffer_ticks                         "1"
        cl_interp_ratio                               "0"
        cl_async_usercmd_send                         "false"
        fps_max_ui "120"
        in_button_double_press_window "0.3"
        snd_ui_positional            "false"
        snd_ui_spatialization_spread "2.4"
        snd_envelope_rate                        "100.0"
        snd_soundmixer_update_maximum_frame_rate "0"
        speaker_config
        {
            min     "0"
            default "0"
            max     "2"
        }

        cq_buffer_bloat_msecs_max "120"
        snd_soundmixer                   "Default_Mix"
        cloth_filter_transform_stateless "0"
        cl_joystick_enabled       "1"
        panorama_joystick_enabled "1"
        snd_event_browser_focus_events "true"
        cl_max_particle_pvs_aabb_edge_length "100"
        citadel_enable_vdata_sound_preload "true"
        r_add_views_in_pre_output          "1"
    }

    Memory
    {
        EstimatedMaxCPUMemUsageMB "1"
        EstimatedMinGPUMemUsageMB "1"

        ShowInsufficientPageFileMessageBox      "1"
        ShowLowAvailableVirtualMemoryMessageBox "1"
    }
}
