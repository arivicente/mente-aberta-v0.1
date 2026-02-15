
import { createClient, User } from '@supabase/supabase-js';
import { Message, SpecialistId } from '../types';

const supabaseUrl = 'https://cubacjyrehzrewxlxnff.supabase.co';
const supabaseAnonKey = 'sb_publishable_hLLzPeM0LMbz31vyT_n3hg_XfDRbFzb';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Funções de Autenticação
export const signInWithGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) {
    console.error('Erro ao logar com Google:', error.message);
    alert(`Erro: Provedor Google não está ativo no Supabase. Vá em Authentication -> Providers e ative o Google.`);
  }
};

export const signInAnonymously = async () => {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('Erro no login anônimo:', error.message);
    // Não damos alert aqui para permitir o fallback silencioso ou via UI no App.tsx
  }
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  localStorage.removeItem('mente_aberta_mock_user');
  if (error) console.error('Erro ao deslogar:', error.message);
};

// Gerenciamento de ID Local (Fallback para quando Auth está desativado)
export const getLocalGuestId = (): string => {
  let id = localStorage.getItem('mente_aberta_mock_user');
  if (!id) {
    id = `local_${crypto.randomUUID()}`;
    localStorage.setItem('mente_aberta_mock_user', id);
  }
  return id;
};

// Lógica de Mensagens vinculada ao Usuário (aceita userId de Auth ou Local)
export const fetchMessages = async (specialistId: SpecialistId, userId: string): Promise<Message[]> => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('guest_id', userId)
    .eq('specialist_id', specialistId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao buscar mensagens:', error);
    return [];
  }

  return data.map(m => ({
    id: m.id,
    role: m.role as 'user' | 'model',
    content: m.content,
    timestamp: new Date(m.created_at).getTime()
  }));
};

export const saveMessage = async (specialistId: SpecialistId, message: Message, userId: string) => {
  const { error } = await supabase
    .from('messages')
    .insert([{
      id: message.id,
      guest_id: userId,
      specialist_id: specialistId,
      role: message.role,
      content: message.content,
      created_at: new Date(message.timestamp).toISOString()
    }]);

  if (error) console.error('Erro ao salvar mensagem no banco:', error);
};

export const clearMessages = async (specialistId: SpecialistId, userId: string) => {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('guest_id', userId)
    .eq('specialist_id', specialistId);
  
  if (error) console.error('Erro ao limpar histórico:', error);
};
