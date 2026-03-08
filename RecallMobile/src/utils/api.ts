import AsyncStorage from '@react-native-async-storage/async-storage';

class AuthExpiredError extends Error {
  constructor() {
    super('Authentication expired. Please login again.');
    this.name = 'AuthExpiredError';
  }
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await AsyncStorage.getItem('recall_token');

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Token expired or invalid — clear local auth state
    await AsyncStorage.multiRemove(['recall_token', 'recall_shop_id', 'recall_shop_name']);
    throw new AuthExpiredError();
  }

  return response;
}

export { AuthExpiredError };
