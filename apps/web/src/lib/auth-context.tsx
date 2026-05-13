'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type {
  ILoginRequest,
  IRegisterRequest,
  IUpdateProfileRequest,
  IUserResponse,
} from './types/auth';
import {
  AuthApiError,
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  updateProfile as updateProfileApi,
} from './api-client';

interface IAuthContextValue {
  readonly user: IUserResponse | null;
  readonly isLoading: boolean;
  readonly login: (data: ILoginRequest) => Promise<void>;
  readonly register: (data: IRegisterRequest) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly updateProfile: (data: IUpdateProfileRequest) => Promise<IUserResponse>;
  readonly refreshUser: () => Promise<void>;
}

const AuthContext = createContext<IAuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<IUserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    getCurrentUser()
      .then((currentUser) => setUser(currentUser))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (data: ILoginRequest) => {
      const loggedInUser = await loginUser(data);
      setUser(loggedInUser);
      router.push('/');
    },
    [router]
  );

  const register = useCallback(
    async (data: IRegisterRequest) => {
      const registeredUser = await registerUser(data);
      setUser(registeredUser);
      router.push('/');
    },
    [router]
  );

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
    router.push('/login');
  }, [router]);

  const updateProfile = useCallback(async (data: IUpdateProfileRequest) => {
    const updated = await updateProfileApi(data);
    setUser(updated);
    return updated;
  }, []);

  const refreshUser = useCallback(async () => {
    const fresh = await getCurrentUser();
    setUser(fresh);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, logout, updateProfile, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): IAuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export { AuthApiError };
