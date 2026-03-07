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
import type { IUserResponse, ILoginRequest, IRegisterRequest } from './types/auth';
import {
  loginUser,
  registerUser,
  logoutUser,
  getCurrentUser,
  AuthApiError,
} from './api-client';

interface IAuthContextValue {
  readonly user: IUserResponse | null;
  readonly isLoading: boolean;
  readonly login: (data: ILoginRequest) => Promise<void>;
  readonly register: (data: IRegisterRequest) => Promise<void>;
  readonly logout: () => Promise<void>;
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

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
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
