"GameInfo"
{
	game 		"citadel"
	title 		"Citadel"
	type		multiplayer_only
	nomodels 1
	nohimodel 1
	nocrosshair 0
	hidden_maps
	{
		"test_speakers"			1
		"test_hardware"			1
	}
	nodegraph 0
	perfwizard 0
	tonemapping 0 
	GameData	"citadel.fgd"
	
	Localize
	{
		DuplicateTokensAssert	1
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
	
	
	
	
// Deadlock Mod Manager - Start

		SearchPaths
        {  
            Mod                 citadel
            Write               citadel          
            Game                citadel
            Mod                 core
            Write               core
            Game                core        
        }
// Deadlock Mod Manager - End
	}
	
	MaterialSystem2
	{
		RenderModes
		{
			game Default
			game Forward
			game Deferred
			game Outline
			game Depth
			game FrontDepth
			game MotionVectors

			dev ToolsVis // Visualization modes for all shaders (lighting only, normal maps only, etc.)
			dev ToolsWireframe // This should use the ToolsVis mode above instead of being its own mode\

			tools ToolsUtil // Meant to be used to render tools sceneobjects that are mod-independent, like the origin grid
		}
	}

	MaterialEditor
	{
		"DefaultShader" "environment_texture_set"
	}

	NetworkSystem
	{
		BetaUniverse
		{
			FakeLag			40
			FakeLoss		.1
			//FakeReorderPct 0.05
			//FakeReorderDelay 10
			//FakeJitter "low"
			// Turning off fake jitter for now while I work on making the CQ totally solid
			FakeReorderPct 0
			FakeReorderDelay 0
			FakeJitter "off"
		}

		"SkipRedundantChangeCallbacks"	"1"
	}

	RenderSystem
	{
		IndexBufferPoolSizeMB 32
		UseReverseDepth 1
		Use32BitDepthBuffer 1
		Use32BitDepthBufferWithoutStencil 1
		SwapChainSampleableDepth 1
		VulkanMutableSwapchain 1
		"LowLatency"								"1"
		"VulkanOnly"								"1"	[ $LINUX || $OSX ] // No OpenGL or D3D9/11 fallback on Linux or OSX, only Vulkan is supported.
		"VulkanRequireSubgroupWaveOpSupport"		"1"	[ !$OSX ]
		"VulkanRequireDescriptorIndexing"			"1"	[ !$OSX ]
		"VulkanSteamShaderCache" "1"
		"VulkanSteamAppShaderCache" "1"
		"VulkanSteamDownloadedShaderCache" "1"
		"VulkanAdditionalShaderCache" "vulkan_shader_cache.foz"
		"VulkanStagingPMBSizeLimitMB" "384"
		"GraphicsPipelineLibrary"	"1"
		"VulkanOnlyTestProbability" "0"
		"VulkanDefrag"				"1"
		"MinStreamingPoolSizeMB"	"1024"
		"MinStreamingPoolSizeMBTools" "2048"
		"AlwaysPreloadTexturesInGame" "0"
	}

	NVNGX
	{
		AppID 103371621
		SupportsDLSS 1
	}

	Engine2
	{
		HasModAppSystems 1
		Capable64Bit 1
		URLName citadel
		RenderingPipeline
		{
			SupportsMSAA 0
			DistanceField 1
		}
		PauseSinglePlayerOnGameOverlay 1
		DefensiveConCommands 1
		DisableLoadingPlaque 1
	}

	ContentBuilder
	{
		ResourceCompilerDirectXUsesWARP "0"
	}

	SoundSystem
	{
		SteamAudioEnabled            "1"
		WaveDataCacheSizeMB          "256"
	}
	Sounds
	{
		HierarchicalEncodingFiles	 "1"
	}

	ToolsEnvironment
	{
		"Engine"	"Source 2"
		"ToolsDir"	"../sdktools"	// NOTE: Default Tools path. This is relative to the mod path.
	}
	
	pulse
	{
		"pulse_enabled"					"1"
	}

	Hammer
	{
		"fgd"					"citadel.fgd"	// NOTE: This is relative to the 'game' path.
		"GameFeatureSet"		"Citadel"
		"DefaultSolidEntity"	"trigger_multiple"
		"DefaultPointEntity"	"info_player_start"
		"NavMarkupEntity"		"func_nav_markup"
		"OverlayBoxSize"			"8"
		"TileMeshesEnabled"			"1"
		"RenderMode"				"ToolsVis"
		"CreateRenderClusters"		"1"
		"DefaultMinDrawVolumeSize"	"2048"
		"DefaultMinTrianglesPerCluster"	"16384"
		"TileGridSupportsBlendHeight"	"1"
		"TileGridBlendDefaultColor"	"0 255 0"
		"LoadScriptEntities" "0"
		"UsesBakedLighting" "1"
		"UseAnalyticGrid" "0"
		"SupportsDisplacementMapping" "0"
		"SteamAudioEnabled"				"1"
		"LatticeDeformerEnabled"		"1"
	}

	SoundTool
	{
		"DefaultSoundEventType" "src1_3d"

		SoundEventBaseOptions
		{
			"Base.Announcer.VO.2d" ""
			"Base.World.VO.Emitter.3d" ""
			"Base.Hero.VO.Ping.2d" ""
			"Base.Hero.VO.2d" ""
			"Base.Hero.VO.3d" ""
			"Base.Hero.VO.Ability.3d" ""
			"Base.Hero.VO.Ultimate.3d" ""
			"Base.Hero.VO.Dash.3d" ""
			"Base.Hero.VO.Effort.3d" ""
			"Base.Hero.VO.Pain.3d" ""
			"Base.Hero.VO.Melee.3d" ""
			"Base.Hero.VO.Death.3d" ""
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
			"bakedlighting"	"1"	// Enable lightmapping during compile time		
			"envmap"	"0" // turned off since it currently causes an assert and doesn't work due to some build issue
			"nav"		"1"	// Generate nav mesh data
		}

		MeshCompiler
		{
			OptimizeForMeshlets 1
			TrianglesPerMeshlet 64	// Maximum valid value currently is 126
			UseMikkTSpace 1
			EncodeVertexBuffer 1
			EncodeIndexBuffer 1
			SplitDepthStream 1
		}

		WorldRendererBuilder
		{
			VisibilityGuidedMeshClustering      "1"
			MinimumTrianglesPerClusteredMesh    "8192"
			MinimumVerticesPerClusteredMesh     "8192"
			MinimumVolumePerClusteredMesh       "8192"       // ~20x20x20 cube
			MaxPrecomputedVisClusterMembership  "96"
			MaxCullingBoundsGroups              "128"
			UseAggregateInstances				"1"
			AggregateInstancingMeshlets			"1"
			BakePropsWithExtraVertexStreams		"1"
		}

		BakedLighting
		{
			Version 4
			ImportanceVolumeTransitionRegion 512            // distance we transition from high to low resolution charts 
			LightmapChannels
			{
				direct_light_shadows 1
				debug_chart_color 1
				directional_irradiance_sh2_dc 1
				
				directional_irradiance_sh2_r
				{
					CompressedFormat DXT1
				}
				
				directional_irradiance_sh2_g
				{
					CompressedFormat DXT1
				}
				
				directional_irradiance_sh2_b
				{
					CompressedFormat DXT1
				}
			}
			LightmapGutterSize 2 // For bicubic filtering
			UseStaticLightProbes 0
			LPVAtlas 1
			BC6HHueShiftFixup 0 // Causes more artifacts than it solves atm
		}

		SteamAudio
		{
			ReverbDefaults
			{
				GridSpacing			"3.0"
				HeightAboveFloor	"1.5"
				RebakeOption		"0"						// 0: cleanup, 1: manual, 2: auto
				NumRays				"32768"
				NumBounces			"64"
				IRDuration			"1.0"
				AmbisonicsOrder		"1"
			}
			PathingDefaults
			{
				GridSpacing			"3.0"
				HeightAboveFloor	"1.5"
				RebakeOption		"0"						// 0: cleanup, 1: manual, 2: auto
				NumVisSamples		"1"
				ProbeVisRadius		"0"
				ProbeVisThreshold	"0.1"
				ProbeVisPathRange	"1000.0"
			}
		}
		SoundStackScripts
		{
			CompileStacksStrict "1"
		}
		VisBuilder
		{
			MaxVisClusters "4096"
			PreMergeOpenSpaceDistanceThreshold "128.0"
			PreMergeOpenSpaceMaxDimension "2048.0"
			PreMergeOpenSpaceMaxRatio "8.0"
			PreMergeSmallRegionsSizeThreshold "20.0"
		}
	}

	Source1Import
	{
		// this is just copied from the left4dead3 gameinfo.gi
		"forcevtxfileupconvert" 1
	}

	WorldRenderer
	{
		EnvironmentMaps					1
		EnvironmentMapFaceSize			256
		EnvironmentMapRenderSize		1024
		EnvironmentMapFormat			BC6H
		EnvironmentMapPreviewFormat 		BC6H
		EnvironmentMapColorSpace		linear
		EnvironmentMapMipProcessor		GGXCubeMapBlur
		// Build cubemaps into a cube array instead of individual cubemaps.
		"EnvironmentMapUseCubeArray" 	1
		"EnvironmentMapCacheSizeTools"  300
		BindlessSceneObjectDesc			CitadelBindlessDesc
		GrassCastsShadows				1
	}

	SceneSystem
	{
		GpuLightBinner 1
		FogCachedShadowAtlasWidth 2048
		FogCachedShadowAtlasHeight 2048
		FogCachedShadowTileSize 256
		GpuLightBinnerSunLightFastPath 1
		CSMCascadeResolution 2048
		SunLightManagerCount 0
		SunLightManagerCountTools 0
		DefaultShadowTextureWidth 6144
		DefaultShadowTextureHeight 6144
		DynamicShadowResolution 1

		TransformTextureRowCount	2048
		SunLightMaxCascadeSize		4
		SunLightShadowRenderMode	Depth
		LayerBatchThresholdFullsort 20
		NonTexturedGradientFog		1
		// Temp till I can add support in citadel shaders
		DisableLateAllocatedTransformBuffer 1
		MinimumLateAllocatedVertexCacheBufferSizeMB 64
		CubemapFog 1
		VolumetricFog 1
		FrameBufferCopyFormat R11G11B10F
		Tonemapping 0
		
		WellKnownLightCookies
		{
			"blank" "materials/effects/lightcookies/blank.vtex"
			"flashlight" "materials/effects/lightcookies/flashlight.vtex"
		}

		ComputeShaderSkinning 1
	}

	NavSystem
	{
		"NavTileSize" "128.0"
		"NavCellSize" "1.5"
		"NavCellHeight" "2.0"

		// Hull definitions live in scripts/nav_hulls.vdata
		// Preset definitions live in scripts/nav_hulls_presets.vdata
		"NavHullsPreset" "default"

		"NavRegionMinSize" "8"
		"NavRegionMergeSize" "20"
		"NavEdgeMaxLen" "1200"
		"NavEdgeMaxError" "51.0"
		"NavVertsPerPoly" "4"
		"NavDetailSampleDistance" "120.0"
		"NavDetailSampleMaxError" "2.0"
		"NavSmallAreaOnEdgeRemovalSize" "81.0"
	}

	AnimationSystem
	{
		"DisableServerInterpCompensation"	"1"
		"DisableAnimationScript" 	"1"
		"ServerPoseRecipeHistorySize"	"60"
		"ClientPoseRecipeHistorySize"	"60"

	}

	ModelDoc
	{
		"models_gamedata"			"models_gamedata.fgd"
		"features"					"animgraph;modelconfig;gamepreview;wireframe_backfaces;distancefield"
	}

	Particles
	{
		"EnableParticleShaderFeatureBranching"	"1"
		"Float16HDRBackBuffer" "1"
		"PET_SupportFadingOpaqueModels" "1"
		"Features" "non_homogenous_forward_layer_only"
	}

	ConVars
	{


		// ================ GRAPHICS SETTINGS ================
		// Core Quality
		"gpu_level" "0"                     // Minimum Shader Details Level
		"cpu_level" "0"                     // Minimum Effect Details Level
		"mat_set_shader_quality" "0"

		// Fov
		"r_aspectratio" "2.7"              // 1.75=80fov | 2.15=90fov | 2.49=100fov

		// Lighting & Shadows
		"r_directlighting" "0"
		"r_ssao" "0"                        // Disable ambient occlusion
		"lb_enable_shadow_casting" "0"
		"lb_csm_draw_alpha_tested" "0"
		"lb_csm_draw_translucent" "0"
		"lb_barnlight_shadowmap_scale" "0.5"
		"lb_csm_cascade_size_override" "1"
		"lb_dynamic_shadow_resolution_quantization" "128"
		"r_citadel_sun_shadow_slope_scale_depth_bias" "1.0"
		"sparseshadowtree_enable_rendering" "1"
		"lb_csm_override_staticgeo_cascades_value" "0"
		"lb_csm_receiver_plane_depth_bias" "0.00002"
		"lb_csm_receiver_plane_depth_bias_transmissive_backface" "0.0002"
		"lb_sun_csm_size_cull_threshold_texels" "30"


		// Fog & Atmosphere
		"r_enable_volume_fog" "0"
		"r_enable_gradient_fog" "0"
		"r_enable_cubemap_fog" "0"
		"volume_fog_intermediate_textures_hdr" "0"

		// Sky & Environment
		"r_draw3dskybox" "0"
		"r_drawskybox" "1"                  // Set to 0 to disable skybox
		"r_monitor_3dskybox" "0"

		// SSAO
		"r_citadel_ssao_bent_normals" "false"
		"r_citadel_ssao_denoise_passes" "0"
		"r_citadel_ssao_quality" "0"
		"r_citadel_ssao_radius" "0"
		"r_citadel_ssao_thin_occluder_compensation" "0"

		// ================ PARTICLE SYSTEM ================
		"r_particle_max_detail_level" "0"
		"r_particle_cables_cast_shadows" "0"
		"r_RainParticleDensity" "0"
		"r_physics_particle_op_spawn_scale" "0"
		"r_particle_min_timestep" "0"
		"r_particle_max_size_cull" "800"
		"particle_cluster_nodraw" "1"
		"r_particle_mixed_resolution_viewstart" "800"
		"cl_particle_sim_fallback_threshold_ms" "4"
		"cl_parallel_readpacketentities_threshold" "4"
		"sc_cache_envmap_lpv_lookup" "0"
		"sc_layer_batch_threshold_fullsort" "40"
		"cl_particle_max_count" "350" // Major testing

		// ================ PHYSICS & CLOTH ================
		"cloth_update" "1"                   // Enable cloth physics
		"cloth_sim_on_tick" "0"
		"presettle_cloth_iterations" "3"
		"pred_cloth_pos_max" "1.0"          // Reduce cloth prediction
		"pred_cloth_pos_multiplier" "0.3"
		"pred_cloth_pos_strength" "0.1"
		"pred_cloth_rot_high" "0.05"
		"pred_cloth_rot_low" "0.005"
		"pred_cloth_rot_multiplier" "0.2"
		"cl_phys_timescale" "0"             // Disable physics

		// ================ MODEL & DECAL OPTIMIZATIONS ================
		"r_drawmodeldecals" "0"
		"r_character_decal_resolution" "1"
		"r_decals" "16"                   // Number of Decals being drawn
		"r_propsmaxdist" "800"
		"props_break_max_pieces_perframe" "0"
		"r_citadel_screenspace_particles_full_res" "0"
		"r_citadel_gpu_culling_shadows" "1"
		"skeleton_instance_lod_optimization" "1"
		"r_size_cull_threshold" "1.2"
		"r_hair_ao" "0"

		// LOD
		"sc_instanced_mesh_lod_bias" "5" //Bias for LOD selection of instanced meshes
		"sc_instanced_mesh_lod_bias_shadow" "5.5" // Bias for LOD selection of instanced meshes in shadowmaps
		"sc_instanced_mesh_motion_vectors" "0" // Set 1 if you use motion blur
		"sc_instanced_mesh_size_cull_bias" "5" // Bias for size culling of instanced meshes
		"sc_instanced_mesh_size_cull_bias_shadow" "5.5" // Bias for size culling instanced meshes in shadowmaps

		// ================ ROPE PHYSICS ================
		"rope_collide" "0"
		"rope_subdiv" "0"
		"rope_wind_dist" "0"
		"rope_smooth_enlarge" "0"
		"rope_smooth_maxalpha" "0"
		"rope_smooth_maxalphawidth" "0"
		"rope_smooth_minalpha" "0"
		"rope_smooth_minwidth" "0"
		"r_ropetranslucent" "0"

		// ================ TERRAIN & FOLIAGE ================
		"r_grass_quality" "0"
		"r_grass_start_fade" "0"
		"r_grass_end_fade" "0"

		// ================ UI & HUD ================
		"panorama_disable_box_shadow" "1"
		"r_dashboard_render_quality" "1"
		"closecaption" "false"
		"citadel_hud_objective_health_enabled" "2"  // 0=Off, 1=Shrines, 2=T1/T2, 3=Barracks
		"citadel_boss_glow_disabled" "1"
		"citadel_damage_offscreen_indicator_disabled" "0" // Set 1 to disable
		"citadel_portrait_world_renderer_off" "false" //Set true to disable hero hud

		// Damage Text (Set it according to your preference)
		"citadel_damage_text_lifetime" "1.5"
		"citadel_damage_text_lifetime_new" "0.75" 
		"citadel_damage_text_lifetime_accumulated_new" "2"

		// ================ NETWORK & PREDICTION ================
		"cl_prediction_savedata_postentitypacketreceived" "1"
		"r_frame_sync_enable" "0"

		// ================ AI OPTIMIZATIONS ================
		"ai_strong_optimizations_no_checkstand" "1"
		"ai_expression_optimization" "1"

		// ================ MISC ================
		"sc_hdr_enabled_override" "0"
		"r_texturefilteringquality" "0"
		"cl_ragdoll_limit" "0" //Set it on console if ragdoll still lingers longer
		"citadel_show_new_damage_feedback_numbers" "0" //Set 1 to enable
		"r_pipeline_stats_present_flush" "1"
		"r_pipeline_stats_command_flush" "1"
		"sv_ag2_low_skel_lod" "true"
		"r_max_portal_render_targets" "2" // Set how many amount to render portals


		"rate"
		{
			"min"		"98304"
			"default"	"786432"
			"max"		"1000000"
		}
		"sv_minrate"	"98304"
		"sv_maxunlag"	"0.500"
		"sv_maxunlag_player" "0.200"
		"sv_lagcomp_filterbyviewangle" "false"
		"cl_clock_buffer_ticks"	"1"
		"cl_interp_ratio" "0"
		"cl_async_usercmd_send" "false"

		// Spew warning when adding/removing classes to/from the top of the hierarchy
		"panorama_classes_perf_warning_threshold_ms" "0.75"

		// Panorama - enable minidumps on JS exceptions
		"panorama_js_minidumps" "1"
		// Enable the render target cache optimization.
		"panorama_disable_render_target_cache" "0"

		// Enable the composition layer optimization
		"panorama_skip_composition_layer_content_paint" "1"

		// too expensive (500MB+) to load this
		"snd_steamaudio_load_reverb_data" "0"
		"snd_steamaudio_load_pathing_data" "0"

		// Steam Audio project specific convars
		"snd_steamaudio_enable_custom_hrtf"		"0"
		"snd_steamaudio_active_hrtf"			"0"
		"snd_steamaudio_reverb_update_rate"		"10.0"
		"snd_steamaudio_ir_duration"			"1.0"
		"snd_steamaudio_enable_pathing"			"0"
		"snd_steamaudio_invalid_path_length"	"0.0"
		"cl_disconnect_soundevent"				"citadel.convar.stop_all_game_layer_soundevents"
		"snd_event_browser_default_stack"		"citadel_default_3d"
		
		// voip
		"voice_in_process"			            "1"

		// Sound debugging
		"snd_report_audio_nan" "1"

		"voice_always_sample_mic"               
		{
			"version"	"2"
			"default"	"0"
		}

		"reset_voice_on_input_stallout"         "0"
		"voice_input_stallout"                  "0.5"
		"cl_usesocketsforloopback" "1"
		"cl_poll_network_early" "0"

		// For perf reasons, since we don't use source-based DSP:
		"disable_source_soundscape_trace"       "1"
		
		"cl_tickpacket_desired_queuelength" "1"

		"fps_max"		"400"
		"fps_max_ui"	"120"

		"in_button_double_press_window" "0.3"

		// Convars that control spatialization of UI audio.
		"snd_ui_positional"								"1"
		"snd_ui_spatialization_spread"					"2.4"
		
		// sound volume rate change limiting
		"snd_envelope_rate"								"100.0"
		"snd_soundmixer_update_maximum_frame_rate" 		"0"

		//don't let people mess with speaker config settings.
		"speaker_config"
		{
			"min"		"0"
			"default"	"0"
			"max"		"2"
		}

		"cq_buffer_bloat_msecs_max" "120"

		"snd_soundmixer"						"Default_Mix"
		"cloth_filter_transform_stateless" "0"

		"cl_joystick_enabled" "0"
		"panorama_joystick_enabled" "0"

		"snd_event_browser_focus_events" "true"

		"cl_max_particle_pvs_aabb_edge_length" "100"
		"cl_aggregate_particles" "true"
		
		"citadel_enable_vdata_sound_preload" "true"
	}

	Memory
	{
		"EstimatedMaxCPUMemUsageMB"	"1"
		"EstimatedMinGPUMemUsageMB"	"1"

		"ShowInsufficientPageFileMessageBox" "1"
		"ShowLowAvailableVirtualMemoryMessageBox" "1"
	}
}
