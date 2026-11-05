use source2_tools::{CompileMode, ProtonRuntime, compiler_command};
use std::{fs, path::Path, process::Stdio, time::SystemTime};

const HEADER: &str = "<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:vpcf63:version{a6e6a69e-52d3-4527-8b9c-ff3bb91aca3e} -->";

fn particle(lifespan: f32) -> String {
    format!(
        "{HEADER}\n{{ _class=\"CParticleSystemDefinition\" m_nBehaviorVersion=12 m_flConstantLifespan={lifespan} }}\n"
    )
}

fn write_tga(path: &Path, bgra: [u8; 4]) {
    let mut bytes = vec![0; 18];
    bytes[2] = 2;
    bytes[12] = 4;
    bytes[14] = 4;
    bytes[16] = 32;
    bytes[17] = 0x28;
    bytes.extend(bgra.repeat(16));
    fs::write(path, bytes).unwrap();
}

fn compiler_path(path: &Path) -> String {
    if cfg!(windows) {
        path.to_str().unwrap().into()
    } else {
        format!("Z:{}", path.to_str().unwrap().replace('/', "\\"))
    }
}

fn modified(path: &Path) -> SystemTime {
    fs::metadata(path)
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()))
        .modified()
        .unwrap()
}

/// Uses an installed, prepared SDK and removes only its own temporary addon.
/// Linux also needs DMM_TEST_PROTON, DMM_TEST_STEAM_ROOT and an initialized
/// DMM_TEST_PROTON_PREFIX. DMM_TEST_COMPILE_LOG_DIR optionally keeps compiler logs.
#[test]
#[ignore = "requires DMM_TEST_SDK and an authenticated tools environment"]
fn real_compiler_skips_unchanged_assets_and_tracks_dependencies() {
    let sdk = std::path::PathBuf::from(std::env::var_os("DMM_TEST_SDK").unwrap());
    let name = format!(
        "dmm_verify_incremental_{}_{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let content = tempfile::Builder::new()
        .prefix(&name)
        .rand_bytes(0)
        .tempdir_in(sdk.join("content/citadel_addons"))
        .unwrap();
    let game = tempfile::Builder::new()
        .prefix(&name)
        .rand_bytes(0)
        .tempdir_in(sdk.join("game/citadel_addons"))
        .unwrap();
    fs::write(
        game.path().join("addoninfo.txt"),
        "\"AddonInfo\" { \"IsTemplate\" \"0\" \"IsPlayable\" \"0\" }",
    )
    .unwrap();
    fs::create_dir(content.path().join("particles")).unwrap();
    fs::create_dir(content.path().join("materials")).unwrap();
    let parent = content.path().join("materials/texture.vtex");
    let child = content.path().join("materials/input.tga");
    write_tga(&child, [0, 0, 255, 255]);
    fs::write(&parent, r#"<!-- dmx encoding keyvalues2_noids 1 format vtex 1 -->
"CDmeVtex"
{
 "m_inputTextureArray" "element_array"
 [ "CDmeInputTexture" { "m_name" "string" "InputTexture0" "m_fileName" "string" "materials/input.tga" "m_colorSpace" "string" "srgb" "m_typeString" "string" "2D" } ]
 "m_outputTypeString" "string" "2D"
 "m_outputFormat" "string" "RGBA8888"
 "m_textureOutputChannelArray" "element_array"
 [ "CDmeTextureOutputChannel" { "m_inputTextureArray" "string_array" [ "InputTexture0" ] "m_srcChannels" "string" "rgba" "m_dstChannels" "string" "rgba" "m_mipAlgorithm" "CDmeImageProcessor" { "m_algorithm" "string" "Box" } "m_outputColorSpace" "string" "srgb" } ]
}
"#).unwrap();
    let parent_output = game.path().join("materials/texture.vtex_c");
    let proton = (!cfg!(windows)).then(|| ProtonRuntime {
        launcher: std::env::var_os("DMM_TEST_PROTON").unwrap().into(),
        steam_root: std::env::var_os("DMM_TEST_STEAM_ROOT").unwrap().into(),
        prefix: std::env::var_os("DMM_TEST_PROTON_PREFIX").unwrap().into(),
    });
    let logs = tempfile::tempdir().unwrap();
    let logs_path = std::env::var_os("DMM_TEST_COMPILE_LOG_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| logs.path().into());
    fs::create_dir_all(&logs_path).unwrap();
    let run = |label: &str, mode, inputs: &[&Path]| {
        let list = logs.path().join("inputs.txt");
        fs::write(
            &list,
            inputs
                .iter()
                .map(|path| compiler_path(path))
                .collect::<Vec<_>>()
                .join("\n")
                + "\n",
        )
        .unwrap();
        let log = logs_path.join(format!("{label}.log"));
        let file = fs::File::create(&log).unwrap();
        let started = std::time::Instant::now();
        let status = compiler_command(&sdk, &name, &list, mode, proton.as_ref())
            .unwrap()
            .stdin(Stdio::null())
            .stdout(file.try_clone().unwrap())
            .stderr(file)
            .status()
            .unwrap();
        let text = fs::read_to_string(&log).unwrap();
        assert!(
            status.success() && !text.contains("RESOURCE COMPILE ERROR:"),
            "{label} failed: {}",
            log.display()
        );
        let summary = text
            .lines()
            .rev()
            .find(|line| line.contains(" compiled, "))
            .unwrap_or("No compile summary");
        println!("{label}: {} ms · {summary}", started.elapsed().as_millis());
    };

    run("initial", CompileMode::Incremental, &[&parent]);
    let first_parent = modified(&parent_output);
    let first_bytes = fs::read(&parent_output).unwrap();
    run("unchanged", CompileMode::Incremental, &[&parent]);
    assert_eq!(modified(&parent_output), first_parent);

    write_tga(&child, [0, 255, 0, 255]);
    run("changed-dependency", CompileMode::Incremental, &[&parent]);
    assert_ne!(
        modified(&parent_output),
        first_parent,
        "Changing the source image did not rebuild its texture"
    );
    assert_ne!(fs::read(&parent_output).unwrap(), first_bytes);

    let new_source = content.path().join("particles/new.vpcf");
    fs::write(&new_source, particle(3.)).unwrap();
    run(
        "new-asset",
        CompileMode::Incremental,
        &[&parent, &new_source],
    );
    assert!(game.path().join("particles/new.vpcf_c").is_file());

    fs::remove_file(&parent_output).unwrap();
    run("missing-output", CompileMode::Incremental, &[&parent]);
    assert!(
        parent_output.is_file(),
        "Missing texture output was not rebuilt"
    );

    let before_rebuild = modified(&parent_output);
    run("rebuild", CompileMode::Rebuild, &[&parent, &new_source]);
    assert_ne!(modified(&parent_output), before_rebuild);
    let rebuilt = modified(&parent_output);
    run(
        "after-rebuild",
        CompileMode::Incremental,
        &[&parent, &new_source],
    );
    assert_eq!(modified(&parent_output), rebuilt);
}
