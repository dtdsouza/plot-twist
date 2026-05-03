import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password | Plot-Twist',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
