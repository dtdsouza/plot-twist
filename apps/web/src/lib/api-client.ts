import type {
  ILoginRequest,
  IRegisterRequest,
  IUserResponse,
} from './types/auth';

class AuthApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AuthApiError';
    this.statusCode = statusCode;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw new AuthApiError(
      data.message || 'An unexpected error occurred',
      response.status
    );
  }

  return data as T;
}

export async function loginUser(data: ILoginRequest): Promise<IUserResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  const result = await handleResponse<{ user: IUserResponse }>(response);
  return result.user;
}

export async function registerUser(
  data: IRegisterRequest
): Promise<IUserResponse> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  const result = await handleResponse<{ user: IUserResponse }>(response);
  return result.user;
}

export async function logoutUser(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'DELETE',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new AuthApiError('Logout failed', response.status);
  }
}

export async function getCurrentUser(): Promise<IUserResponse | null> {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'same-origin',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export { AuthApiError };
