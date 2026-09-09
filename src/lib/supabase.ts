import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Загрузка логотипа в Supabase Storage
export async function uploadLogo(file: File): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Проверяем авторизацию
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { 
        success: false, 
        error: 'Необходимо войти в систему для загрузки логотипа'
      };
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `company-logo.${fileExt}`;
    
    // Проверяем существование bucket
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
      return { 
        success: false, 
        error: 'Ошибка доступа к хранилищу. Проверьте настройки Supabase.'
      };
    }
    
    const logosBucket = buckets?.find(b => b.name === 'logos');
    if (!logosBucket) {
      return { 
        success: false, 
        error: 'Bucket "logos" не существует. Создайте его в Supabase Dashboard.'
      };
    }
    
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(fileName, file, { 
        upsert: true,
        cacheControl: '3600',
        contentType: file.type
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      
      // Определяем тип ошибки
      if (uploadError.message.includes('new row violates row-level security')) {
        return { 
          success: false, 
          error: 'Ошибка прав доступа. Настройте RLS политики для bucket "logos" в Supabase.'
        };
      }
      
      return { 
        success: false, 
        error: `Ошибка загрузки: ${uploadError.message}`
      };
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('logos')
      .getPublicUrl(fileName);
    
    return { success: true, url: publicUrl };
  } catch (error) {
    console.error('Upload failed:', error);
    return { 
      success: false, 
      error: 'Неизвестная ошибка при загрузке логотипа'
    };
  }
}
