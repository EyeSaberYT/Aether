//! CurseForge API client and normalization into Modrinth-shaped types.

use std::collections::HashMap;

use serde::Deserialize;

use crate::api::modrinth::{self, GalleryItem, License, ResolvedFile};
use crate::error::{AetherError, Result};

pub const CURSEFORGE_API_KEY: &str = "$2a$10$e5XXQKI74zV.SHywaz7l2.9ELP/Bd9lYydtqrTBjNtuFFO8owmDTW";
const API_BASE: &str = "https://api.curseforge.com";

fn cf_id_to_modrinth(id: i64) -> String {
    format!("cf:{id}")
}

fn modrinth_id_to_cf(id: &str) -> Option<i64> {
    if let Some(rest) = id.strip_prefix("cf:") {
        rest.parse::<i64>().ok()
    } else {
        None
    }
}

fn version_to_modrinth(project_id: &str, file_id: i64) -> String {
    if let Some(cf) = project_id.strip_prefix("cf:") {
        format!("cf:{cf}:{file_id}")
    } else {
        format!("cf:{project_id}:{file_id}")
    }
}

fn modrinth_version_to_cf(version_id: &str) -> Option<(i64, i64)> {
    if let Some(rest) = version_id.strip_prefix("cf:") {
        let parts: Vec<&str> = rest.splitn(2, ':').collect();
        if parts.len() == 2 {
            if let (Ok(mod_id), Ok(file_id)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
                return Some((mod_id, file_id));
            }
        }
    }
    None
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfPagination {
    index: u32,
    page_size: u32,
    total_count: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfMod {
    id: i64,
    name: String,
    slug: String,
    summary: Option<String>,
    #[serde(default)]
    categories: Vec<CfCategory>,
    download_count: i64,
    date_modified: Option<String>,
    date_created: Option<String>,
    date_published: Option<String>,
    logo: Option<CfAsset>,
    screenshots: Option<Vec<CfAsset>>,
    links: Option<CfLinks>,
    authors: Option<Vec<CfAuthor>>,
    game_versions: Option<Vec<String>>,
    license: Option<CfLicense>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfCategory {
    name: String,
    slug: String,
    class_id: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfAsset {
    title: Option<String>,
    description: Option<String>,
    thumbnail_url: Option<String>,
    url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfLinks {
    source_url: Option<String>,
    issues_url: Option<String>,
    wiki_url: Option<String>,
    discord_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfAuthor {
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfLicense {
    id: Option<String>,
    name: String,
    url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfSearchResponse {
    pagination: Option<CfPagination>,
    data: Vec<CfMod>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfModResponse {
    data: CfMod,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfDescriptionResponse {
    data: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfFile {
    id: i64,
    mod_id: i64,
    file_name: String,
    display_name: Option<String>,
    file_length: i64,
    download_url: Option<String>,
    hashes: Vec<CfHash>,
    game_versions: Vec<String>,
    dependencies: Vec<CfDependency>,
    release_type: i32,
    is_available: bool,
    file_date: Option<String>,
    changelog: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfHash {
    value: String,
    algo: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfDependency {
    mod_id: i64,
    relation_type: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfFilesResponse {
    data: Vec<CfFile>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfDownloadUrlResponse {
    data: String,
}

#[derive(Debug, Clone)]
pub struct CurseForgeClient {
    http: reqwest::Client,
}

impl CurseForgeClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }

    async fn get<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = if path.starts_with("http") { path.to_string() } else { format!("{API_BASE}{path}") };
        let res = self
            .http
            .get(&url)
            .header("x-api-key", CURSEFORGE_API_KEY)
            .header("User-Agent", crate::USER_AGENT)
            .send()
            .await?;
        if res.status().is_success() {
            Ok(res.json::<T>().await?)
        } else {
            Err(AetherError::msg(format!("CurseForge returned {} for {path}", res.status())))
        }
    }

    pub async fn search(&self, filters: &modrinth::SearchFilters, limit: u32, offset: u32) -> Result<modrinth::SearchResponse> {
        let mut params: Vec<String> = vec![];
        if !filters.query.is_empty() {
            params.push(format!("searchFilter={}", modrinth::urlencode(&filters.query)));
        }
        let class_id = class_id_for_type(&filters.project_type);
        if let Some(cid) = class_id {
            params.push(format!("classId={cid}"));
        }
        if let Some(game) = &filters.game_version {
            if !game.is_empty() && game != "any" {
                params.push(format!("gameVersion={}", modrinth::urlencode(game)));
            }
        }
        let modloader = cf_modloader(&filters.loader);
        if let Some(m) = modloader {
            params.push(format!("modLoaderType={m}"));
        }
        let sort_field = match filters.index.as_deref().unwrap_or("relevance") {
            "downloads" => "totalDownloads",
            "follows" => "popularity",
            "updated" | "newest" => "lastUpdated",
            _ => "relevance",
        };
        params.push(format!("sortField={sort_field}"));
        params.push("sortOrder=desc".to_string());
        params.push(format!("index={}", offset));
        params.push(format!("pageSize={}", limit.min(50)));
        let path = format!("/v1/mods/search?{}", params.join("&"));
        let resp: CfSearchResponse = self.get(&path).await?;
        let total = resp.pagination.as_ref().map(|p| p.total_count).unwrap_or_else(|| resp.data.len() as u32);
        let offset_out = resp.pagination.as_ref().map(|p| p.index).unwrap_or(offset);
        let limit_out = resp.pagination.as_ref().map(|p| p.page_size).unwrap_or(limit);
        Ok(modrinth::SearchResponse {
            hits: resp.data.into_iter().map(cf_mod_to_hit).collect(),
            offset: offset_out,
            limit: limit_out,
            total_hits: total,
        })
    }

    pub async fn project(&self, id: &str) -> Result<modrinth::Project> {
        let Some(cid) = modrinth_id_to_cf(id) else {
            return Err(AetherError::msg("invalid curseforge id"));
        };
        let resp: CfModResponse = self.get(&format!("/v1/mods/{cid}")).await?;
        let body = self.mod_description(cid).await.unwrap_or_default();
        Ok(cf_mod_to_project(&resp.data, body))
    }

    async fn mod_description(&self, id: i64) -> Result<String> {
        let resp: CfDescriptionResponse = self.get(&format!("/v1/mods/{id}/description")).await?;
        Ok(resp.data)
    }

    pub async fn versions(&self, project_id: &str, game_versions: &[String], loaders: &[String]) -> Result<Vec<modrinth::Version>> {
        let Some(cid) = modrinth_id_to_cf(project_id) else {
            return Err(AetherError::msg("invalid curseforge id"));
        };
        let mut params: Vec<String> = vec![];
        if !game_versions.is_empty() && !game_versions[0].is_empty() {
            params.push(format!("gameVersion={}", modrinth::urlencode(&game_versions[0])));
        }
        if !loaders.is_empty() && !loaders[0].is_empty() {
            let m = cf_modloader_name(&loaders[0]);
            if let Some(m) = m {
                params.push(format!("modLoaderType={m}"));
            }
        }
        params.push("sortOrder=desc".to_string());
        params.push("pageSize=50".to_string());
        let path = format!("/v1/mods/{cid}/files?{}", params.join("&"));
        let resp: CfFilesResponse = self.get(&path).await?;
        Ok(resp.data.into_iter().filter(|f| f.is_available).map(|f| cf_file_to_version(&f, project_id)).collect())
    }

    pub async fn version(&self, version_id: &str) -> Result<modrinth::Version> {
        let Some((mod_id, file_id)) = modrinth_version_to_cf(version_id) else {
            return Err(AetherError::msg("invalid version id"));
        };
        let resp: CfFilesResponse = self.get(&format!("/v1/mods/{mod_id}/files?fileIds={file_id}")).await?;
        let file = resp.data.into_iter().next().ok_or_else(|| AetherError::msg("version not found"))?;
        Ok(cf_file_to_version(&file, &cf_id_to_modrinth(mod_id)))
    }

    pub async fn primary_file(&self, version: &modrinth::Version) -> Result<ResolvedFile> {
        let Some((mod_id, file_id)) = modrinth_version_to_cf(&version.id) else {
            return Err(AetherError::msg("invalid version id"));
        };
        let project = self.project(&version.project_id).await?;
        let file_resp: CfFilesResponse = self.get(&format!("/v1/mods/{mod_id}/files?fileIds={file_id}")).await?;
        let file = file_resp.data.into_iter().next().ok_or_else(|| AetherError::msg("file not found"))?;
        Ok(cf_file_to_resolved(&file, &project, false))
    }

    pub async fn tags(&self, kind: &str) -> Result<Vec<modrinth::Tag>> {
        match kind {
            "loader" => Ok(vec![
                modrinth::Tag { name: "fabric".to_string(), version_type: None, project_type: None, icon: None, header: None },
                modrinth::Tag { name: "forge".to_string(), version_type: None, project_type: None, icon: None, header: None },
                modrinth::Tag { name: "quilt".to_string(), version_type: None, project_type: None, icon: None, header: None },
                modrinth::Tag { name: "neoforge".to_string(), version_type: None, project_type: None, icon: None, header: None },
            ]),
            _ => Ok(vec![]),
        }
    }
}

fn cf_modloader(loader: &Option<String>) -> Option<i32> {
    match loader.as_deref() {
        Some("fabric") => Some(4),
        Some("forge") => Some(1),
        Some("quilt") => Some(5),
        Some("neoforge") => Some(6),
        _ => None,
    }
}

fn cf_modloader_name(loader: &str) -> Option<i32> {
    cf_modloader(&Some(loader.to_string()))
}

fn cf_mod_to_hit(m: CfMod) -> modrinth::SearchHit {
    let mut gallery: Vec<String> = vec![];
    if let Some(screens) = &m.screenshots {
        for s in screens {
            if let Some(th) = &s.thumbnail_url { gallery.push(th.clone()); } else { gallery.push(s.url.clone()); }
        }
    }
    modrinth::SearchHit {
        project_id: cf_id_to_modrinth(m.id),
        project_type: class_to_project_type(m.categories.first().and_then(|c| c.class_id).unwrap_or(6)),
        slug: m.slug.clone(),
        author: m.authors.as_ref().and_then(|a| a.first()).map(|a| a.name.clone()).unwrap_or_default(),
        title: m.name.clone(),
        description: m.summary.clone().unwrap_or_default(),
        categories: m.categories.iter().map(|c| c.slug.clone()).collect(),
        display_categories: m.categories.iter().map(|c| c.name.clone()).collect(),
        versions: m.game_versions.clone().unwrap_or_default(),
        downloads: m.download_count as u64,
        follows: 0,
        icon_url: m.logo.as_ref().map(|l| l.url.clone()),
        date_created: m.date_created.clone(),
        date_modified: m.date_modified.clone(),
        latest_version: None,
        license: m.license.as_ref().map(|l| l.name.clone()),
        client_side: None,
        server_side: None,
        gallery,
    }
}

fn cf_mod_to_project(m: &CfMod, body: String) -> modrinth::Project {
    modrinth::Project {
        id: cf_id_to_modrinth(m.id),
        slug: m.slug.clone(),
        title: m.name.clone(),
        description: m.summary.clone().unwrap_or_default(),
        body,
        project_type: class_to_project_type(m.categories.first().and_then(|c| c.class_id).unwrap_or(6)),
        categories: m.categories.iter().map(|c| c.slug.clone()).collect(),
        additional_categories: vec![],
        game_versions: m.game_versions.clone().unwrap_or_default(),
        loaders: vec![],
        downloads: m.download_count as u64,
        followers: 0,
        icon_url: m.logo.as_ref().map(|l| l.url.clone()),
        gallery: m.screenshots.as_ref().unwrap_or(&vec![]).iter().map(|s| GalleryItem {
            url: s.url.clone(),
            featured: false,
            title: s.title.clone(),
            description: s.description.clone(),
        }).collect(),
        license: m.license.as_ref().map(|l| License { id: l.id.clone().unwrap_or_default(), name: l.name.clone(), url: l.url.clone() }),
        source_url: m.links.as_ref().and_then(|ln| ln.source_url.clone()),
        issues_url: m.links.as_ref().and_then(|ln| ln.issues_url.clone()),
        wiki_url: m.links.as_ref().and_then(|ln| ln.wiki_url.clone()),
        discord_url: m.links.as_ref().and_then(|ln| ln.discord_url.clone()),
        client_side: None,
        server_side: None,
        team: None,
        published: m.date_published.clone(),
        updated: m.date_modified.clone(),
        versions: vec![],
    }
}

fn class_to_project_type(class_id: i32) -> String {
    match class_id {
        4471 => "modpack".to_string(),
        12 => "resourcepack".to_string(),
        6552 => "shader".to_string(),
        6945 => "datapack".to_string(),
        _ => "mod".to_string(),
    }
}

fn class_id_for_type(ty: &Option<String>) -> Option<i32> {
    match ty.as_deref() {
        Some("mod") => Some(6),
        Some("modpack") => Some(4471),
        Some("resourcepack") => Some(12),
        Some("shader") => Some(6552),
        Some("datapack") => Some(6945),
        _ => None,
    }
}

fn cf_file_to_version(f: &CfFile, project_id: &str) -> modrinth::Version {
    let mut loaders: Vec<String> = vec![];
    for v in &f.game_versions {
        let low = v.to_ascii_lowercase();
        if low == "fabric" { loaders.push("fabric".to_string()); }
        if low == "forge" { loaders.push("forge".to_string()); }
        if low == "quilt" { loaders.push("quilt".to_string()); }
        if low == "neoforge" { loaders.push("neoforge".to_string()); }
    }
    let mut game_versions: Vec<String> = vec![];
    for v in &f.game_versions {
        let low = v.to_ascii_lowercase();
        if low == "fabric" || low == "forge" || low == "quilt" || low == "neoforge" || low == "client" || low == "server" { continue; }
        game_versions.push(v.clone());
    }
    let mut hashes = HashMap::new();
    for h in &f.hashes {
        if h.algo == 1 { hashes.insert("sha1".to_string(), h.value.clone()); }
    }
    modrinth::Version {
        id: version_to_modrinth(project_id, f.id),
        project_id: project_id.to_string(),
        name: f.display_name.clone().unwrap_or_else(|| f.file_name.clone()),
        version_number: f.file_name.clone(),
        version_type: match f.release_type {
            1 => "release".to_string(),
            2 => "beta".to_string(),
            3 => "alpha".to_string(),
            _ => "release".to_string(),
        },
        game_versions,
        loaders,
        files: vec![modrinth::VersionFile {
            hashes,
            url: f.download_url.clone().unwrap_or_default(),
            filename: f.file_name.clone(),
            primary: true,
            size: f.file_length as u64,
            file_type: None,
        }],
        dependencies: f.dependencies.iter().filter(|d| d.relation_type == 3).map(|d| modrinth::Dependency {
            version_id: None,
            project_id: Some(cf_id_to_modrinth(d.mod_id)),
            file_name: None,
            dependency_type: "required".to_string(),
        }).collect(),
        downloads: 0,
        date_published: f.file_date.clone(),
        changelog: f.changelog.clone(),
    }
}

fn cf_file_to_resolved(f: &CfFile, project: &modrinth::Project, dependency: bool) -> ResolvedFile {
    let mut sha1 = None;
    for h in &f.hashes {
        if h.algo == 1 { sha1 = Some(h.value.clone()); break; }
    }
    ResolvedFile {
        project_id: cf_id_to_modrinth(f.mod_id),
        version_id: version_to_modrinth(&project.id, f.id),
        title: project.title.clone(),
        project_type: project.project_type.clone(),
        url: f.download_url.clone().unwrap_or_default(),
        filename: f.file_name.clone(),
        sha1,
        size: f.file_length as u64,
        icon_url: project.icon_url.clone(),
        dependency,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn id_roundtrip() {
        assert_eq!(cf_id_to_modrinth(123), "cf:123");
        assert_eq!(modrinth_id_to_cf("cf:123"), Some(123));
        assert_eq!(modrinth_id_to_cf("modrinth123"), None);
    }

    #[test]
    fn version_roundtrip() {
        assert_eq!(version_to_modrinth("cf:123", 456), "cf:123:456");
        assert_eq!(modrinth_version_to_cf("cf:123:456"), Some((123, 456)));
    }
}