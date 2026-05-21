import type {
  IChangePasswordRequest,
  IEmailChangeInitiateRequest,
  ILoginRequest,
  IRegisterRequest,
  IUpdateProfileRequest,
  IUserResponse,
  IVerifyEmailChangeRequest,
} from './types/auth';
import type {
  IAvatarFinalizeRequest,
  IAvatarUploadIntentRequest,
  IAvatarUploadIntentResponse,
} from './types/avatar';
import type {
  IClubCoverUploadIntentRequest,
  IClubCoverUploadIntentResponse,
  IClubResponse,
  ICreateClubRequest,
  IFinalizeClubCoverRequest,
  IUpdateClubRequest,
} from './types/club';

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
      cache: 'no-store',
    });

    // 401 means no session; anything else (5xx) is transient — treat as no
    // change to local state. Only true unauthorized clears the user.
    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export async function forgotPassword(data: {
  email: string;
}): Promise<{ message: string }> {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  return handleResponse<{ message: string }>(response);
}

export async function resetPassword(data: {
  token: string;
  password: string;
}): Promise<{ message: string }> {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  return handleResponse<{ message: string }>(response);
}

export async function updateProfile(
  data: IUpdateProfileRequest
): Promise<IUserResponse> {
  const response = await fetch('/api/user/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  return handleResponse<IUserResponse>(response);
}

export async function changePassword(
  data: IChangePasswordRequest
): Promise<{ message: string }> {
  const response = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  return handleResponse<{ message: string }>(response);
}

export async function initiateEmailChange(
  data: IEmailChangeInitiateRequest
): Promise<{ message: string }> {
  const response = await fetch('/api/user/me/email-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  return handleResponse<{ message: string }>(response);
}

export async function verifyEmailChange(
  data: IVerifyEmailChangeRequest
): Promise<{ message: string; email: string }> {
  const response = await fetch('/api/auth/verify-email-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  return handleResponse<{ message: string; email: string }>(response);
}

export async function createAvatarUploadIntent(
  data: IAvatarUploadIntentRequest
): Promise<IAvatarUploadIntentResponse> {
  const response = await fetch('/api/user/me/avatar/upload-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  return handleResponse<IAvatarUploadIntentResponse>(response);
}

export async function finalizeAvatarUpload(
  data: IAvatarFinalizeRequest
): Promise<IUserResponse> {
  const response = await fetch('/api/user/me/avatar/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });

  return handleResponse<IUserResponse>(response);
}

export function uploadToPresignedPost(
  url: string,
  fields: Readonly<Record<string, string>>,
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      formData.append(k, v);
    }
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded, event.total);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new AuthApiError(
            `Upload failed (HTTP ${xhr.status})`,
            xhr.status
          )
        );
      }
    };
    xhr.onerror = () => {
      reject(new AuthApiError('Network error during upload', 0));
    };

    xhr.send(formData);
  });
}

export async function listClubs(): Promise<IClubResponse[]> {
  const response = await fetch('/api/clubs', {
    credentials: 'same-origin',
    cache: 'no-store',
  });

  return handleResponse<IClubResponse[]>(response);
}

export async function getClub(id: string): Promise<IClubResponse> {
  const response = await fetch(`/api/clubs/${id}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });

  return handleResponse<IClubResponse>(response);
}

export async function createClub(dto: ICreateClubRequest): Promise<IClubResponse> {
  const response = await fetch('/api/clubs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'same-origin',
  });

  return handleResponse<IClubResponse>(response);
}

export async function updateClub(
  id: string,
  dto: IUpdateClubRequest
): Promise<IClubResponse> {
  const response = await fetch(`/api/clubs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'same-origin',
  });

  return handleResponse<IClubResponse>(response);
}

export async function deleteClub(id: string): Promise<void> {
  const response = await fetch(`/api/clubs/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });

  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    const data = await response.json();
    throw new AuthApiError(
      data.message || 'Could not delete club',
      response.status
    );
  }
}

export async function requestClubCoverIntent(
  id: string,
  dto: IClubCoverUploadIntentRequest
): Promise<IClubCoverUploadIntentResponse> {
  const response = await fetch(`/api/clubs/${id}/cover/upload-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'same-origin',
  });

  return handleResponse<IClubCoverUploadIntentResponse>(response);
}

export async function finalizeClubCover(
  id: string,
  dto: IFinalizeClubCoverRequest
): Promise<IClubResponse> {
  const response = await fetch(`/api/clubs/${id}/cover/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'same-origin',
  });

  return handleResponse<IClubResponse>(response);
}

export { AuthApiError };
