const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

class ApiClient {
    private token: string | null = null;

    setToken(token: string | null) {
        this.token = token;
        if (token) {
            localStorage.setItem('auth_token', token);
        } else {
            localStorage.removeItem('auth_token');
        }
    }

    getToken(): string | null {
        if (this.token) return this.token;
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem('auth_token');
        }
        return this.token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<ApiResponse<T>> {
        const url = `${API_BASE_URL}${endpoint}`;
        const token = this.getToken();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            throw error;
        }
    }

    // Auth
    async login(email: string, password: string) {
        const response = await this.request<{ user: any; token: string }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        if (response.data?.token) {
            this.setToken(response.data.token);
        }
        return response;
    }

    async register(email: string, password: string, name?: string) {
        const response = await this.request<{ user: any; token: string }>('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
        });
        if (response.data?.token) {
            this.setToken(response.data.token);
        }
        return response;
    }

    async getMe() {
        return this.request('/auth/me');
    }

    logout() {
        this.setToken(null);
    }

    // Admin - Instances
    async createInstance(name: string, proxy?: {
        proxyHost?: string;
        proxyPort?: string;
        proxyUsername?: string;
        proxyPassword?: string;
        proxyProtocol?: 'http' | 'https' | 'socks4' | 'socks5';
    }) {
        return this.request('/admin/instance', {
            method: 'POST',
            body: JSON.stringify({ name, ...proxy }),
        });
    }

    async getInstances() {
        return this.request('/admin/instances');
    }

    async getInstance(id: string) {
        return this.request(`/admin/instance/${id}`);
    }

    async deleteInstance(id: string) {
        return this.request(`/admin/instance/${id}`, {
            method: 'DELETE',
        });
    }

    async getStats() {
        return this.request('/admin/stats');
    }

    // Instance Proxy
    async getInstanceProxy(id: string) {
        return this.request(`/instance/${id}/proxy`);
    }

    async updateInstanceProxy(id: string, proxy: {
        proxyHost?: string | null;
        proxyPort?: string | null;
        proxyUsername?: string | null;
        proxyPassword?: string | null;
        proxyProtocol?: 'http' | 'https' | 'socks4' | 'socks5' | null;
    }) {
        return this.request(`/instance/${id}/proxy`, {
            method: 'PATCH',
            body: JSON.stringify(proxy),
        });
    }

    // Instance Connection
    async connectInstance(id: string) {
        return this.request(`/instance/${id}/connect`, {
            method: 'POST',
        });
    }

    async connectWithPairingCode(id: string, phoneNumber: string) {
        return this.request(`/instance/${id}/connect-code`, {
            method: 'POST',
            body: JSON.stringify({ phoneNumber }),
        });
    }

    async disconnectInstance(id: string) {
        return this.request(`/instance/${id}/disconnect`, {
            method: 'POST',
        });
    }

    async logoutInstance(id: string) {
        return this.request(`/instance/${id}/logout`, {
            method: 'POST',
        });
    }

    async getInstanceStatus(id: string) {
        return this.request(`/instance/${id}/status`);
    }

    async getInstanceQR(id: string) {
        return this.request(`/instance/${id}/qr`);
    }

    // Instance Webhook
    async updateInstanceWebhook(id: string, webhookUrl: string | null, webhookEvents: string[] = []) {
        return this.request(`/instance/${id}/webhook`, {
            method: 'POST',
            body: JSON.stringify({ webhookUrl, webhookEvents }),
        });
    }

    // Instance Settings
    async getInstanceSettings(id: string) {
        return this.request(`/instance/${id}/settings`);
    }

    async updateInstanceSettings(id: string, settings: {
        alwaysOnline?: boolean;
        ignoreGroups?: boolean;
        rejectCalls?: boolean;
        readMessages?: boolean;
        syncFullHistory?: boolean;
    }) {
        return this.request(`/instance/${id}/settings`, {
            method: 'PATCH',
            body: JSON.stringify(settings),
        });
    }

    // Campaigns
    async getCampaigns() {
        return this.request('/campaigns');
    }

    async getCampaign(id: string) {
        return this.request(`/campaign/${id}`);
    }

    async createSimpleCampaign(data: {
        name: string;
        instanceId: string;
        message: { type: 'text' | 'media'; text?: string; mediaUrl?: string; caption?: string };
        recipients: string[];
        delay?: number;
    }) {
        return this.request('/campaign/simple', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async startCampaign(id: string) {
        return this.request(`/campaign/${id}/start`, {
            method: 'POST',
        });
    }

    async controlCampaign(id: string, action: 'pause' | 'resume' | 'cancel') {
        return this.request(`/campaign/${id}/control`, {
            method: 'POST',
            body: JSON.stringify({ action }),
        });
    }

    async deleteCampaign(id: string) {
        return this.request(`/campaign/${id}`, {
            method: 'DELETE',
        });
    }
}

export const api = new ApiClient();
