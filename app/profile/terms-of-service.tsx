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

export default function TermsOfServiceScreen() {
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
          <Text style={styles.headerTitle}>Terms of Service</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.lastUpdated}>Last Updated: January 1, 2026</Text>

          <Text style={styles.paragraph}>
            This End User License Agreement ("Agreement") is a legal agreement between you and River Studio ("we," "us," or "our") for the use of our mobile application MemQ ("App"). By downloading, installing, or using the App, you agree to be bound by the terms of this Agreement.
          </Text>

          <Text style={styles.sectionTitle}>1. License Grant</Text>
          <Text style={styles.paragraph}>
            Subject to your compliance with this Agreement, we grant you a limited, non-exclusive, non-transferable, revocable license to download, install, and use the App on devices that you own or control, solely for your personal, non-commercial use.
          </Text>

          <Text style={styles.sectionTitle}>2. Restrictions</Text>
          <Text style={styles.paragraph}>You agree NOT to:</Text>
          <Text style={styles.bulletPoint}>• Copy, modify, or create derivative works of the App</Text>
          <Text style={styles.bulletPoint}>• Reverse engineer, decompile, or disassemble the App</Text>
          <Text style={styles.bulletPoint}>• Remove any copyright or proprietary notices</Text>
          <Text style={styles.bulletPoint}>• Use the App for any illegal or unauthorized purpose</Text>
          <Text style={styles.bulletPoint}>• Attempt to gain unauthorized access to the App or related systems</Text>
          <Text style={styles.bulletPoint}>• Share your account credentials with others</Text>
          <Text style={styles.bulletPoint}>• Use automated systems (bots, scripts) to access the App</Text>

          <Text style={styles.sectionTitle}>3. User Account</Text>
          <Text style={styles.bulletPoint}>• Account Creation: You are responsible for maintaining the confidentiality of your account credentials</Text>
          <Text style={styles.bulletPoint}>• Account Security: You are responsible for all activities that occur under your account</Text>
          <Text style={styles.bulletPoint}>• Account Termination: We reserve the right to suspend or terminate your account for violations of this Agreement</Text>

          <Text style={styles.sectionTitle}>4. Subscription Services</Text>
          <Text style={styles.bulletPoint}>• Subscription Plans: The App offers subscription plans with different features and pricing</Text>
          <Text style={styles.bulletPoint}>• Billing: Subscriptions are billed through your App Store account (Apple App Store or Google Play Store)</Text>
          <Text style={styles.bulletPoint}>• Auto-Renewal: Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period</Text>
          <Text style={styles.bulletPoint}>• Cancellation: You can cancel your subscription at any time through your device's App Store settings</Text>
          <Text style={styles.bulletPoint}>• Refunds: Refund requests are handled according to the App Store's refund policies</Text>

          <Text style={styles.sectionTitle}>5. AI-Generated Content</Text>
          <Text style={styles.paragraph}>
            The App uses artificial intelligence (AI) to generate educational content, answer questions, and provide learning assistance. By using the App, you acknowledge and agree that:
          </Text>

          <Text style={styles.subsectionTitle}>5.1 Zero Tolerance for Offensive Content</Text>
          <Text style={styles.paragraphBold}>
            We maintain a strict zero-tolerance policy for offensive, harmful, or inappropriate content generated through our AI features.
          </Text>

          <Text style={styles.paragraph}>Prohibited Content: You must not use the App to generate, request, or share content that is:</Text>
          <Text style={styles.bulletPoint}>• Illegal, harmful, threatening, abusive, or violent</Text>
          <Text style={styles.bulletPoint}>• Defamatory, libelous, or invasive of privacy</Text>
          <Text style={styles.bulletPoint}>• Discriminatory or hateful based on race, religion, gender, sexual orientation, or other protected characteristics</Text>
          <Text style={styles.bulletPoint}>• Sexually explicit, pornographic, or obscene</Text>
          <Text style={styles.bulletPoint}>• Intended to harm or exploit minors</Text>
          <Text style={styles.bulletPoint}>• Infringing on intellectual property rights</Text>
          <Text style={styles.bulletPoint}>• Misleading, fraudulent, or deceptive</Text>
          <Text style={styles.bulletPoint}>• Otherwise objectionable or inappropriate</Text>

          <Text style={styles.paragraph}>Content Moderation: We reserve the right to:</Text>
          <Text style={styles.bulletPoint}>• Monitor, review, and moderate AI-generated content</Text>
          <Text style={styles.bulletPoint}>• Remove or block content that violates this policy</Text>
          <Text style={styles.bulletPoint}>• Suspend or terminate accounts that generate or request prohibited content</Text>
          <Text style={styles.bulletPoint}>• Report illegal content to appropriate authorities</Text>

          <Text style={styles.paragraph}>User Responsibility: You are solely responsible for:</Text>
          <Text style={styles.bulletPoint}>• The content you input into the App</Text>
          <Text style={styles.bulletPoint}>• The use of AI-generated content</Text>
          <Text style={styles.bulletPoint}>• Ensuring compliance with all applicable laws and regulations</Text>
          <Text style={styles.bulletPoint}>• Not using the App to generate content that violates this Agreement</Text>

          <Text style={styles.subsectionTitle}>5.2 AI Service Limitations</Text>
          <Text style={styles.bulletPoint}>• Accuracy: AI-generated content is provided "as is" and may contain errors or inaccuracies</Text>
          <Text style={styles.bulletPoint}>• No Warranty: We do not guarantee the accuracy, completeness, or reliability of AI-generated content</Text>
          <Text style={styles.bulletPoint}>• Third-Party Services: AI services are provided by third-party providers (OpenAI) and subject to their terms and limitations</Text>
          <Text style={styles.bulletPoint}>• Use at Your Own Risk: You use AI-generated content at your own risk and should verify important information independently</Text>

          <Text style={styles.sectionTitle}>6. User Content</Text>
          <Text style={styles.bulletPoint}>• Your Content: You retain ownership of content you create (lessons, terms, notes)</Text>
          <Text style={styles.bulletPoint}>• License to Us: By uploading content, you grant us a license to store, process, and display your content within the App</Text>
          <Text style={styles.bulletPoint}>• Content Standards: Your content must comply with this Agreement and applicable laws</Text>
          <Text style={styles.bulletPoint}>• Content Removal: We reserve the right to remove content that violates this Agreement</Text>

          <Text style={styles.sectionTitle}>7. Intellectual Property</Text>
          <Text style={styles.bulletPoint}>• Our Rights: The App, including its design, features, and content, is owned by us and protected by copyright, trademark, and other intellectual property laws</Text>
          <Text style={styles.bulletPoint}>• Trademarks: Our trademarks, service marks, and logos are our property</Text>
          <Text style={styles.bulletPoint}>• Third-Party Rights: The App may include third-party content protected by their respective intellectual property rights</Text>

          <Text style={styles.sectionTitle}>8. Disclaimers and Limitations of Liability</Text>
          <Text style={styles.paragraphBold}>
            THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
          </Text>
          <Text style={styles.bulletPoint}>• No Guarantee: We do not guarantee that the App will be uninterrupted, error-free, or secure</Text>
          <Text style={styles.bulletPoint}>• Limitation of Liability: TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, LOSS OF PROFITS, OR BUSINESS INTERRUPTION</Text>
          <Text style={styles.bulletPoint}>• Maximum Liability: Our total liability shall not exceed the amount you paid for the App or subscription in the 12 months preceding the claim</Text>

          <Text style={styles.sectionTitle}>9. Indemnification</Text>
          <Text style={styles.paragraph}>
            You agree to indemnify, defend, and hold us harmless from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from:
          </Text>
          <Text style={styles.bulletPoint}>• Your use of the App</Text>
          <Text style={styles.bulletPoint}>• Your violation of this Agreement</Text>
          <Text style={styles.bulletPoint}>• Your violation of any third-party rights</Text>
          <Text style={styles.bulletPoint}>• Content you create or share through the App</Text>

          <Text style={styles.sectionTitle}>10. Termination</Text>
          <Text style={styles.bulletPoint}>• By You: You may stop using the App and delete your account at any time</Text>
          <Text style={styles.bulletPoint}>• By Us: We may terminate or suspend your access to the App immediately, without prior notice, for violations of this Agreement</Text>
          <Text style={styles.bulletPoint}>• Effect of Termination: Upon termination, your right to use the App ceases, and we may delete your account and data</Text>

          <Text style={styles.sectionTitle}>11. Data Privacy</Text>
          <Text style={styles.paragraph}>
            Your use of the App is also governed by our Privacy Policy, which describes how we collect, use, and protect your information. By using the App, you consent to our data practices as described in the Privacy Policy.
          </Text>

          <Text style={styles.sectionTitle}>12. Changes to This Agreement</Text>
          <Text style={styles.paragraph}>
            We reserve the right to modify this Agreement at any time. We will notify you of material changes by:
          </Text>
          <Text style={styles.bulletPoint}>• Posting the updated Agreement in the App</Text>
          <Text style={styles.bulletPoint}>• Sending a notification through the App</Text>
          <Text style={styles.bulletPoint}>• Updating the "Last Updated" date</Text>
          <Text style={styles.paragraph}>
            Your continued use of the App after changes become effective constitutes acceptance of the modified Agreement.
          </Text>

          <Text style={styles.sectionTitle}>13. Governing Law</Text>
          <Text style={styles.paragraph}>
            This Agreement shall be governed by and construed in accordance with the laws of Italy and the European Union, without regard to its conflict of law provisions.
          </Text>

          <Text style={styles.sectionTitle}>14. Dispute Resolution</Text>
          <Text style={styles.paragraph}>
            Any disputes arising from this Agreement shall be resolved through:
          </Text>
          <Text style={styles.bulletPoint}>• Negotiation: The parties shall first attempt to resolve any dispute through good-faith negotiation</Text>
          <Text style={styles.bulletPoint}>• Arbitration: If negotiation fails, disputes shall be submitted to arbitration in accordance with applicable rules</Text>
          <Text style={styles.bulletPoint}>• Jurisdiction: Any legal proceedings shall be conducted in the competent courts of Italy</Text>

          <Text style={styles.sectionTitle}>15. Severability</Text>
          <Text style={styles.paragraph}>
            If any provision of this Agreement is found to be unenforceable or invalid, the remaining provisions shall remain in full force and effect.
          </Text>

          <Text style={styles.sectionTitle}>16. Entire Agreement</Text>
          <Text style={styles.paragraph}>
            This Agreement, together with our Privacy Policy, constitutes the entire agreement between you and us regarding the App and supersedes all prior agreements.
          </Text>

          <Text style={styles.sectionTitle}>17. Contact Information</Text>
          <Text style={styles.paragraph}>
            If you have questions about this Agreement, please contact us at:
          </Text>
          <Text style={styles.bulletPoint}>• Email: support@riverstudio.cc</Text>

          <Text style={styles.sectionTitle}>18. Acknowledgment</Text>
          <Text style={styles.paragraphBold}>
            BY USING THE APP, YOU ACKNOWLEDGE THAT YOU HAVE READ THIS AGREEMENT, UNDERSTAND IT, AND AGREE TO BE BOUND BY ITS TERMS AND CONDITIONS.
          </Text>
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
  paragraphBold: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    marginBottom: 12,
    fontWeight: '600',
  },
  bulletPoint: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    marginBottom: 8,
    paddingLeft: 8,
  },
});

