use crate::errors::Error;
use log;
use std::fs;
use std::fs::File;
use std::path::Path;

/// Handles extraction of different archive formats
pub struct ArchiveExtractor;

impl ArchiveExtractor {
    pub fn new() -> Self {
        Self
    }

    /// Extract archive based on file extension
    pub fn extract_archive(&self, archive_path: &Path, output_dir: &Path) -> Result<(), Error> {
        log::info!("Extracting archive: {:?} to {:?}", archive_path, output_dir);

        match archive_path.extension().and_then(|e| e.to_str()) {
            Some("zip") => self.extract_zip(archive_path, output_dir),
            Some("rar") => self.extract_rar(archive_path, output_dir),
            Some("7z") => self.extract_7z(archive_path, output_dir),
            Some(ext) => Err(Error::ModExtractionFailed(format!(
                "Unsupported archive format: {}",
                ext
            ))),
            None => Err(Error::ModExtractionFailed(
                "Could not determine archive format".to_string(),
            )),
        }
    }

    /// Extract ZIP archive
    pub fn extract_zip(&self, archive_path: &Path, output_dir: &Path) -> Result<(), Error> {
        let zip_file = File::open(archive_path)?;
        let mut archive = zip::ZipArchive::new(zip_file)?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let outpath = output_dir.join(file.name());

            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent)?;
            }

            if !file.name().ends_with('/') {
                let mut outfile = fs::File::create(&outpath)?;
                std::io::copy(&mut file, &mut outfile)?;
            }
        }

        log::info!("Successfully extracted ZIP archive");
        Ok(())
    }

    /// Extract RAR archive
    pub fn extract_rar(&self, archive_path: &Path, output_dir: &Path) -> Result<(), Error> {
        let mut archive =
            unrar::Archive::new(archive_path.to_string_lossy().as_ref()).open_for_processing()?;

        while let Some(header) = archive.read_header()? {
            archive = if !header.entry().is_file() {
                header.skip()?
            } else {
                header.extract_with_base(output_dir)?
            };
        }

        log::info!("Successfully extracted RAR archive");
        Ok(())
    }

    /// Extract 7Z archive
    pub fn extract_7z(&self, archive_path: &Path, output_dir: &Path) -> Result<(), Error> {
        sevenz_rust::decompress_file(
            archive_path.to_string_lossy().as_ref(),
            output_dir.to_string_lossy().as_ref(),
        )
        .map_err(|e| Error::ModExtractionFailed(e.to_string()))?;

        log::info!("Successfully extracted 7Z archive");
        Ok(())
    }

    /// Check if a file is a supported archive format
    pub fn is_supported_archive(&self, path: &Path) -> bool {
        match path.extension().and_then(|e| e.to_str()) {
            Some("zip") | Some("rar") | Some("7z") => true,
            _ => false,
        }
    }
}

impl Default for ArchiveExtractor {
    fn default() -> Self {
        Self::new()
    }
}
