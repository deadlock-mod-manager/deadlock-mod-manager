use std::path::PathBuf;

use clap::Parser;
use vpkmerger::{
    default_output_path, merge_vpks, MergeOptions, DEFAULT_MAX_OUTPUT_VPK_BYTES,
};

#[derive(Parser)]
#[command(name = "vpk-merger")]
#[command(about = "Merge multiple *_dir.vpk packages into one or more VPKs (1.5 GiB cap per file)")]
struct Cli {
    root: PathBuf,

    #[arg(short = 'o', long = "output", default_value = "merged.vpk")]
    output_name: String,

    #[arg(long = "no-recursive")]
    no_recursive: bool,

    #[arg(long = "dry-run")]
    dry_run: bool,
}

fn main() -> std::process::ExitCode {
    let cli = Cli::parse();
    let output = default_output_path(&cli.root, &cli.output_name);
    let options = MergeOptions {
        root: cli.root,
        output,
        recursive: !cli.no_recursive,
        dry_run: cli.dry_run,
        max_output_vpk_bytes: DEFAULT_MAX_OUTPUT_VPK_BYTES,
    };

    match merge_vpks(options) {
        Ok(report) => {
            eprintln!(
                "sources: {} *_dir.vpk, included: {}, excluded: {}, entries: {}",
                report.source_vpks.len(),
                report.included_vpks.len(),
                report.excluded_vpks.len(),
                report.entry_count
            );
            if report.dry_run {
                eprintln!("dry-run: no files written");
            } else {
                for (path, bytes) in &report.output_files {
                    eprintln!("wrote {} ({} bytes)", path.display(), bytes);
                }
            }
            std::process::ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::ExitCode::from(1)
        }
    }
}
