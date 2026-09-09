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
  alert('🚀 Функция uploadLogo вызвана!');
  try {
    console.log('🔍 [uploadLogo] Начало загрузки логотипа...');
    console.log('📁 [uploadLogo] Файл:', file.name, 'Размер:', file.size, 'Тип:', file.type);
    
    // Проверяем авторизацию
    const { data: { session } } = await supabase.auth.getSession();
    console.log('🔐 [uploadLogo] Сессия:', session ? '✅ Авторизован' : '❌ Не авторизован');
    
    if (!session) {
      console.error('❌ [uploadLogo] Нет сессии');
      return { 
        success: false, 
        error: 'Необходимо войти в систему для загрузки логотипа'
      };
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `company-logo.${fileExt}`;
    console.log('📝 [uploadLogo] Имя файла для загрузки:', fileName);
    
    // Проверяем существование bucket
    console.log('🔍 [uploadLogo] Проверка bucket...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      console.error('❌ [uploadLogo] Ошибка получения списка bucket:', bucketError);
      return { 
        success: false, 
        error: `Ошибка доступа к хранилищу: ${bucketError.message}`
      };
    }
    
    console.log('📦 [uploadLogo] Доступные bucket:', buckets?.map(b => b.name).join(', '));
    
    const logosBucket = buckets?.find(b => b.name === 'logos');
    if (!logosBucket) {
      console.error('❌ [uploadLogo] Bucket "logos" не найден');
      return { 
        success: false, 
        error: 'Bucket "logos" не существует. Создайте его в Supabase Dashboard.'
      };
    }
    
    console.log('✅✅ [uploadLogo] Bucket "logos" найден:', logosBucket);
    console.log('📤 [uploadLogo] Загрузка файла...');
    
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(fileName, file, { 
        upsert: true,
        cacheControl: '3600',
        contentType: file.type
      });
    
    if (uploadError) {
      console.error('❌ [uploadLogo] Ошибка загрузки:', uploadError);
      
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
    
    console.log('✅✅ [uploadLogo] Файл загружен успешно');
    
    const { data: { publicUrl } } = supabase.storage
      .from('logos')
      .getPublicUrl(fileName);
    
    console.log('🔗 [uploadLogo] Публичный URL:', publicUrl);
    
    return { success: true, url: publicUrl };
  } catch (error) {
    console.error('❌ [uploadLogo] Критическая ошибка:', error);
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    return { 
      success: false, 
      error: `Неизвестная ошибка: ${errorMessage}`
    };
  }
}
