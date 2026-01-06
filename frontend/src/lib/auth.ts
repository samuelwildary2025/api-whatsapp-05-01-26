import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from './api';

interface User {
    id: string;
    email: string;
    name?: string;
    role: 'USER' | 'ADMIN';
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name?: string) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: true,

            login: async (email: string, password: string) => {
                const response = await api.login(email, password);
                if (response.data) {
                    set({
                        user: response.data.user,
                        token: response.data.token,
                        isAuthenticated: true,
                    });
                }
            },

            register: async (email: string, password: string, name?: string) => {
                const response = await api.register(email, password, name);
                if (response.data) {
                    set({
                        user: response.data.user,
                        token: response.data.token,
                        isAuthenticated: true,
                    });
                }
            },

            logout: () => {
                api.logout();
                set({
                    user: null,
                    token: null,
                    isAuthenticated: false,
                });
            },

            checkAuth: async () => {
                try {
                    const response = await api.getMe();
                    if (response.data) {
                        set({
                            user: response.data,
                            isAuthenticated: true,
                            isLoading: false,
                        });
                    } else {
                        set({ isLoading: false, isAuthenticated: false });
                    }
                } catch (error) {
                    set({ isLoading: false, isAuthenticated: false });
                }
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ token: state.token }),
        }
    )
);
