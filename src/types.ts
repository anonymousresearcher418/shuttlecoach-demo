export type JsonObject = Record<string, any>

export interface MethodOutput {
  schema_version: string
  content_format?: string
  case: JsonObject
  method: JsonObject
  coaching_output: JsonObject
  structured_evidence?: JsonObject
  internal_evidence?: JsonObject
  provenance: JsonObject
  review_evidence?: JsonObject
}

export interface ReviewCase {
  case_id: string
  subject_id: string
  stroke_id: number
  stroke_type?: string
  media: {
    actual_video?: string
    skeleton_mesh_video?: string
    skeleton_video?: string
    poster_image?: string
    expected_skeleton_mesh_video?: string
    expected_skeleton_video?: string
    expected_actual_video?: string
  }
  outputs: MethodOutput[]
}

export interface ReviewBundle {
  schema_version: 'coaching-local-review-bundle/v1' | 'coaching-public-showcase/v1'
  development_only?: boolean
  method_ids: string[]
  measurement_evidence_modalities?: string[]
  summary: JsonObject
  cases: ReviewCase[]
}
