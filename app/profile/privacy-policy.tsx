import { router } from 'expo-router';
import BackIcon from '@/components/icons/BackIcon';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const options = {
  headerShown: false,
};

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation();

  // 隐藏系统导航栏
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButtonHeader}
            activeOpacity={0.7}
          >
            <BackIcon size={20} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Privacy Policy</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.lastUpdated}>Last Updated: January 1, 2026</Text>

          <Text style={styles.paragraph}>
            This Privacy Policy describes how we collect, use, and protect your information when you use our mobile application ("App"). By using the App, you agree to the collection and use of information in accordance with this policy.
          </Text>

          <Text style={styles.sectionTitle}>Information We Collect</Text>

          <Text style={styles.subsectionTitle}>Personal Information</Text>
          <Text style={styles.bulletPoint}>• Account Information: When you create an account, we collect your email address, username, and profile information.</Text>
          <Text style={styles.bulletPoint}>• Authentication Data: We use secure authentication services to verify your identity.</Text>
          <Text style={styles.bulletPoint}>• User Content: We collect the content you create, including lessons, terms, study progress, and chat conversations.</Text>

          <Text style={styles.subsectionTitle}>Usage Data</Text>
          <Text style={styles.bulletPoint}>• Study Progress: We track your learning progress, including terms studied, completion rates, and review history.</Text>
          <Text style={styles.bulletPoint}>• App Usage: We collect information about how you interact with the App, including features used and time spent.</Text>

          <Text style={styles.subsectionTitle}>Automatically Collected Information</Text>
          <Text style={styles.bulletPoint}>• Device Information: Device type, operating system, and app version.</Text>
          <Text style={styles.bulletPoint}>• Log Data: Technical logs for debugging and improving the App.</Text>

          <Text style={styles.sectionTitle}>How We Use Your Information</Text>
          <Text style={styles.bulletPoint}>• Provide and maintain the App's services</Text>
          <Text style={styles.bulletPoint}>• Personalize your learning experience</Text>
          <Text style={styles.bulletPoint}>• Process subscription payments</Text>
          <Text style={styles.bulletPoint}>• Send notifications and updates (with your consent)</Text>
          <Text style={styles.bulletPoint}>• Improve the App's functionality and user experience</Text>
          <Text style={styles.bulletPoint}>• Ensure security and prevent fraud</Text>

          <Text style={styles.sectionTitle}>Third-Party Services</Text>
          <Text style={styles.paragraph}>
            Our App uses the following third-party services that may collect and process your information:
          </Text>

          <Text style={styles.subsectionTitle}>1. Supabase</Text>
          <Text style={styles.paragraph}>We use Supabase for:</Text>
          <Text style={styles.bulletPoint}>• Authentication: User account management and authentication</Text>
          <Text style={styles.bulletPoint}>• Database Storage: Storing your lessons, terms, progress, and other data</Text>
          <Text style={styles.bulletPoint}>• File Storage: Storing your profile images and uploaded documents</Text>
          <Text style={styles.bulletPoint}>• Real-time Services: Enabling real-time features in the App</Text>
          <Text style={styles.paragraph}>Supabase Privacy Policy: https://supabase.com/privacy</Text>

          <Text style={styles.subsectionTitle}>2. OpenAI</Text>
          <Text style={styles.paragraph}>We use OpenAI's services for:</Text>
          <Text style={styles.bulletPoint}>• AI-Powered Features: Generating educational content, answering questions, and providing learning assistance</Text>
          <Text style={styles.bulletPoint}>• Content Analysis: Analyzing and processing text to extract terms and generate questions</Text>
          <Text style={styles.bulletPoint}>• Chat Functionality: Providing AI-powered chat assistance</Text>
          <Text style={styles.paragraph}>
            Data Processing: When you use AI features, your queries and content may be sent to OpenAI for processing. OpenAI processes this data according to their privacy policy and does not use your data to train their models without your explicit consent (based on your OpenAI account settings).
          </Text>
          <Text style={styles.paragraph}>OpenAI Privacy Policy: https://openai.com/policies/privacy-policy</Text>

          <Text style={styles.subsectionTitle}>3. RevenueCat</Text>
          <Text style={styles.paragraph}>We use RevenueCat for:</Text>
          <Text style={styles.bulletPoint}>• Subscription Management: Processing in-app subscription payments</Text>
          <Text style={styles.bulletPoint}>• Purchase Validation: Verifying and managing subscription status</Text>
          <Text style={styles.bulletPoint}>• Customer Support: Managing subscription-related customer support</Text>
          <Text style={styles.paragraph}>
            RevenueCat processes payment information through their secure payment processors (Apple App Store and Google Play Store). We do not store your payment card information directly.
          </Text>
          <Text style={styles.paragraph}>RevenueCat Privacy Policy: https://www.revenuecat.com/privacy</Text>

          <Text style={styles.sectionTitle}>Data Security</Text>
          <Text style={styles.paragraph}>
            We implement appropriate technical and organizational measures to protect your personal information:
          </Text>
          <Text style={styles.bulletPoint}>• Encrypted data transmission (HTTPS/TLS)</Text>
          <Text style={styles.bulletPoint}>• Secure authentication mechanisms</Text>
          <Text style={styles.bulletPoint}>• Access controls and authentication requirements</Text>
          <Text style={styles.bulletPoint}>• Regular security assessments</Text>
          <Text style={styles.paragraph}>
            However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
          </Text>

          <Text style={styles.sectionTitle}>Data Retention</Text>
          <Text style={styles.paragraph}>
            We retain your personal information for as long as your account is active or as needed to provide you services. If you delete your account, we will delete your personal information in accordance with our data deletion procedures, except where we are required to retain it by law.
          </Text>

          <Text style={styles.sectionTitle}>Your Rights</Text>
          <Text style={styles.paragraph}>
            Depending on your location, you may have certain rights regarding your personal information:
          </Text>
          <Text style={styles.bulletPoint}>• Access: Request access to your personal data</Text>
          <Text style={styles.bulletPoint}>• Correction: Request correction of inaccurate data</Text>
          <Text style={styles.bulletPoint}>• Deletion: Request deletion of your account and personal data</Text>
          <Text style={styles.bulletPoint}>• Portability: Request a copy of your data in a portable format</Text>
          <Text style={styles.bulletPoint}>• Objection: Object to certain processing of your data</Text>
          <Text style={styles.paragraph}>
            To exercise these rights, please contact us or use the account deletion feature in the App settings.
          </Text>

          <Text style={styles.sectionTitle}>Account Deletion</Text>
          <Text style={styles.paragraph}>
            You can delete your account at any time through the App's profile settings. When you delete your account:
          </Text>
          <Text style={styles.bulletPoint}>• All your personal data will be permanently deleted</Text>
          <Text style={styles.bulletPoint}>• Your lessons, terms, progress, and conversations will be removed</Text>
          <Text style={styles.bulletPoint}>• Your subscription will be canceled</Text>
          <Text style={styles.bulletPoint}>• This action cannot be undone</Text>

          <Text style={styles.sectionTitle}>Children's Privacy</Text>
          <Text style={styles.paragraph}>
            Our App is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have collected information from a child under 13, please contact us immediately.
          </Text>

          <Text style={styles.sectionTitle}>Changes to This Privacy Policy</Text>
          <Text style={styles.paragraph}>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.
          </Text>

          <Text style={styles.sectionTitle}>Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have any questions about this Privacy Policy, please contact us at:
          </Text>
          <Text style={styles.bulletPoint}>• Email: support@riverstudio.cc</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  backButtonHeader: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(120,116,150,0.08)',
    borderRadius: 16.4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerRight: {
    width: 40,
  },
  content: {
    paddingHorizontal: 20,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 24,
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    marginBottom: 8,
    paddingLeft: 8,
  },
});

