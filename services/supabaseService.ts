
import { createClient } from '@supabase/supabase-js';
import { Message, SpecialistId } from '../types';

// Credenciais fornecidas pelo usuário
const supabaseUrl = 'https://cubacjyrehzrewxlxnff.supabase.co';
const supabaseAnonKey = 'sb_publishable_hLLzPeM0LMbz31vyT_n3hg_XfDRbFzb';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getGuestId = () => {
  let guestId = localStorage.getItem('mente_aberta_guest_id');
  if (!guestId) {
    guestId = crypto.randomUUID();
    localStorage.setItem('mente_aberta_guest_id', guestId);
  }
  return guestId;
};

export const fetchMessages = async (specialistId: SpecialistId): Promise<Message[]> => {
  const guestId = getGuestId();
  
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('guest_id', guestId)
    .eq('specialist_id', specialistId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao buscar mensagens do Supabase:', error);
    return [];
  }

  return data.map(m => ({
    id: m.id,
    role: m.role as 'user' | 'model',
    content: m.content,
    timestamp: new Date(m.created_at).getTime()
  }));
};

export const saveMessage = async (specialistId: SpecialistId, message: Message) => {
  const guestId = getGuestId();
  
  const { error } = await supabase
    .from('messages')
    .insert([{
      id: message.id,
      guest_id: guestId,
      specialist_id: specialistId,
      role: message.role,
      content: message.content,
      created_at: new Date(message.timestamp).toISOString()
    }]);

  if (error) console.error('Erro ao salvar mensagem no Supabase:', error);
};

export const clearMessages = async (specialistId: SpecialistId) => {
  const guestId = getGuestId();
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('guest_id', guestId)
    .eq('specialist_id', specialistId);
  
  if (error) console.error('Erro ao limpar mensagens no Supabase:', error);
};
