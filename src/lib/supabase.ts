import { createClient } from '@supabase/supabase-js';

const STORAGE_BUCKET = 'logos';
const LOGO_FILE_PREFIX = 'company-logo';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Отсутствуют переменные окружения VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY. ' +
    'Проверьте файл .env или настройки хостинга.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface UploadLogoResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Загружает логотип компании в Supabase Storage.
 * Требует предварительной проверки авторизации на уровне вызывающего кода.
 */
export async function uploadLogo(file: File): Promise<UploadLogoResult> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${LOGO_FILE_PREFIX}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type,
      });

    if (uploadError) {
      if (uploadError.message.includes('row-level security')) {
        return {
          success: false,
          error: 'Ошибка прав доступа. Настройте RLS политики для bucket "logos" в Supabase.',
        };
      }
      return { success: false, error: `Ошибка загрузки: ${uploadError.message}` };
    }

    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);

    return { success: true, url: publicUrl };
  } catch (error) {
    console.error('uploadLogo error:', error);
    return { success: false, error: String(error) };
  }
}
