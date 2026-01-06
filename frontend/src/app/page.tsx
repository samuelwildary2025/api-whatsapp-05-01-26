'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { MessageSquare, Loader2, Mail, Lock, User } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login, register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        toast.success('Login realizado com sucesso!');
      } else {
        await register(email, password, name);
        toast.success('Conta criada com sucesso!');
      }
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao processar');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#128c7e]/20 via-transparent to-[#25d366]/10" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#25d366]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#128c7e]/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary mb-4">
            <MessageSquare className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-2xl font-bold">WhatsApp API</h1>
          <p className="text-[var(--muted)] mt-1">
            {isLogin ? 'Entre na sua conta' : 'Crie sua conta'}
          </p>
        </div>

        {/* Form Card */}
        <div className="glass rounded-2xl p-8 animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">Nome</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]" />
                  <input
                    type="text"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-12"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]" />
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted)]" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="pl-12"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processando...
                </>
              ) : isLogin ? (
                'Entrar'
              ) : (
                'Criar Conta'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-[var(--primary)] hover:underline"
            >
              {isLogin
                ? 'Não tem conta? Criar agora'
                : 'Já tem conta? Fazer login'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[var(--muted)] text-sm mt-8">
          API WhatsApp não-oficial para automação e integração
        </p>
      </div>
    </div>
  );
}
