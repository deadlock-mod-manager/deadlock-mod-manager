use crate::skeleton::Skeleton;

pub(crate) const FORMAT_R32G32B32_FLOAT: u32 = 6;
pub(crate) const FORMAT_R16G16B16A16_UNORM: u32 = 11;
pub(crate) const FORMAT_R16G16B16A16_UINT: u32 = 12;
pub(crate) const FORMAT_R16G16B16A16_SINT: u32 = 14;
pub(crate) const FORMAT_R32G32B32A32_SINT: u32 = 4;
pub(crate) const FORMAT_R32G32_FLOAT: u32 = 16;
pub(crate) const FORMAT_R8G8B8A8_UNORM: u32 = 28;
pub(crate) const FORMAT_R8G8B8A8_UINT: u32 = 30;
pub(crate) const FORMAT_R16G16_FLOAT: u32 = 34;
pub(crate) const FORMAT_R16G16_UNORM: u32 = 35;
pub(crate) const FORMAT_R16G16_SNORM: u32 = 37;
pub(crate) const FORMAT_R16G16_SINT: u32 = 38;
pub(crate) const FORMAT_R32_UINT: u32 = 42;
pub(crate) const GL_FLOAT: u32 = 5126;
pub(crate) const GL_UNSIGNED_SHORT: u32 = 5123;
pub(crate) const GL_UNSIGNED_INT: u32 = 5125;
pub(crate) const GL_ARRAY_BUFFER: u32 = 34962;
pub(crate) const GL_ELEMENT_ARRAY_BUFFER: u32 = 34963;

#[derive(Debug, Clone)]
pub(crate) struct LayoutField {
    pub(crate) semantic_name: String,
    pub(crate) format: u32,
    pub(crate) offset: usize,
}

#[derive(Debug)]
pub(crate) struct BufferData {
    pub(crate) element_count: usize,
    pub(crate) element_size: usize,
    pub(crate) fields: Vec<LayoutField>,
    pub(crate) data: Vec<u8>,
}

#[derive(Debug)]
pub(crate) struct Vbib {
    pub(crate) vertex_buffers: Vec<BufferData>,
    pub(crate) index_buffers: Vec<BufferData>,
}

pub struct ModelGlb {
    pub vertex_count: u32,
    pub index_count: u32,
    pub glb: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct PreviewTexture {
    pub name: String,
    pub material: Option<String>,
    pub png: Vec<u8>,
    pub normal_png: Option<Vec<u8>>,
    pub orm_png: Option<Vec<u8>>,
    pub emissive_png: Option<Vec<u8>>,
    pub base_color_factor: [f32; 4],
    /// glTF metallicFactor. Source 2 hero materials are non-metallic unless the
    /// VMAT declares `g_flMetalness`; defaulting to 0 avoids the oily/chrome look
    /// that results from treating an ambiguous packed "mask" texture as a real ORM.
    pub metalness_factor: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_cutoff: f32,
    pub emissive_factor: Option<[f32; 3]>,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum MaterialAlphaMode {
    #[default]
    Opaque,
    Mask,
    Blend,
}

#[derive(Debug, Clone)]
pub struct RenderMaterial {
    pub name: String,
    pub base_color_png: Option<Vec<u8>>,
    pub normal_png: Option<Vec<u8>>,
    pub orm_png: Option<Vec<u8>>,
    pub emissive_png: Option<Vec<u8>>,
    pub base_color_factor: [f32; 4],
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_cutoff: f32,
    pub emissive_factor: Option<[f32; 3]>,
}

#[derive(Debug, Clone)]
pub struct RenderPrimitive {
    pub positions: Vec<f32>,
    pub normals: Option<Vec<f32>>,
    pub texcoords: Option<Vec<f32>>,
    pub joints: Option<Vec<u16>>,
    pub weights: Option<Vec<f32>>,
    pub indices: Vec<u32>,
    pub material: usize,
    pub mesh_group_mask: u64,
}

#[derive(Debug, Clone)]
pub struct RenderModel {
    pub primitives: Vec<RenderPrimitive>,
    pub materials: Vec<RenderMaterial>,
    pub skeleton: Option<Skeleton>,
    pub default_mesh_group_mask: u64,
}

pub(crate) struct GlbPrimitive<'a> {
    pub(crate) positions: &'a [f32],
    pub(crate) normals: Option<&'a [f32]>,
    pub(crate) texcoords: Option<&'a [f32]>,
    pub(crate) joints: Option<&'a [u16]>,
    pub(crate) weights: Option<&'a [f32]>,
    pub(crate) indices: &'a [u8],
    pub(crate) index_component: u32,
    pub(crate) material: usize,
}

pub(crate) struct DecodedPrimitive {
    pub(crate) positions: Vec<f32>,
    pub(crate) normals: Option<Vec<f32>>,
    pub(crate) texcoords: Option<Vec<f32>>,
    pub(crate) joints: Option<Vec<u16>>,
    pub(crate) weights: Option<Vec<f32>>,
    pub(crate) indices: Vec<u8>,
    pub(crate) index_component: u32,
    pub(crate) index_count: usize,
    pub(crate) material: usize,
    pub(crate) mesh_group_mask: u64,
}

pub(crate) struct DrawCall {
    pub(crate) material: Option<String>,
    pub(crate) index_buffer: usize,
    pub(crate) vertex_buffers: Vec<usize>,
    pub(crate) base_vertex: usize,
    pub(crate) start_index: usize,
    pub(crate) index_count: usize,
}

pub(crate) struct VertexSet {
    pub(crate) positions: Vec<f32>,
    pub(crate) normals: Option<Vec<f32>>,
    pub(crate) texcoords: Option<Vec<f32>>,
    pub(crate) joints: Option<Vec<u16>>,
    pub(crate) weights: Option<Vec<f32>>,
}
