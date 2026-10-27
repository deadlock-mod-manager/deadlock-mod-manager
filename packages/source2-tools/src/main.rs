use std::path::Path;

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    match args.as_slice() {
        [command, configuration] if command == "prepare" => {
            let options = serde_json::from_slice::<source2_tools::PrepareOptions>(&std::fs::read(configuration)?)?;
            let report = source2_tools::prepare_sdk(&options)?;
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
        [command, root] if command == "inspect" => {
            let report = source2_tools::inspect_sdk(Path::new(root))?;
            println!("{}", serde_json::to_string_pretty(&report)?);
            if !report.compatible { std::process::exit(2); }
        }
        [command, editor, runtime, output] if command == "patch-clock" => {
            source2_tools::patch_modeldoc(Path::new(editor), Path::new(runtime), Path::new(output))?;
            println!("{}", source2_tools::PATCHED_EDITOR_SHA256);
        }
        _ => return Err("Usage: source2-tools prepare <configuration.json> | inspect <sdk-root> | patch-clock <editor.dll> <animationsystem.dll> <new-output.dll>".into()),
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
