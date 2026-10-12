export type ReviewStatus = 'pending_review' | 'approved' | 'rejected';
export type PublishedStatus = 'draft' | 'processing' | 'published' | 'failed';

export interface BusinessProfile {
  id: string;
  agency_user_id: string;
  business_name: string;
  niche: string;
  target_location: string;
  brand_voice_style: string;
  target_keywords: string[];
  max_posts_per_month: number;
  current_month_post_count: number;
  quota_period_start: string; // YYYY-MM-DD
  auto_generate_enabled: boolean;
  instagram_page_id: string | null;
  google_gbp_location_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessCredentials {
  business_id: string;
  google_gbp_token: string | null;
  instagram_access_token: string | null;
}

export interface ContentItem {
  id: string;
  business_id: string;
  scheduled_for: string | null;
  generated_caption: string;
  image_prompt: string | null;
  generated_image_url: string | null;
  review_status: ReviewStatus;
  published_status: PublishedStatus;
  admin_notes: string | null;
  external_post_ids: Record<string, string>;
  last_error: string | null;
  quota_period_start: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentWithBusiness = ContentItem & {
  business: Pick<BusinessProfile, 'id' | 'business_name' | 'niche'>;
};

export type ActionResult<T = void> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; code?: string };
