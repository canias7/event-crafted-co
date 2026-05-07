/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: "#ffffff", fontFamily: "\"Helvetica Neue\", Helvetica, Arial, sans-serif", color: "#1a1d22" }
const container = { padding: "40px 32px", maxWidth: "560px" }
const h1 = { fontSize: "28px", fontWeight: 500 as const, color: "#1a1d22", fontFamily: "Georgia, \"Times New Roman\", serif", margin: "0 0 24px", letterSpacing: "-0.01em" }
const text = { fontSize: "15px", color: "#3a3d44", lineHeight: "1.65", margin: "0 0 24px" }
const link = { color: "#c5a26a", textDecoration: "underline" }
const button = { backgroundColor: "#1a1d22", color: "#f7f5f2", fontSize: "14px", borderRadius: "8px", padding: "14px 28px", textDecoration: "none", letterSpacing: "0.02em" }
const codeStyle = { fontFamily: "Courier, monospace", fontSize: "26px", fontWeight: "bold" as const, color: "#1a1d22", letterSpacing: "0.3em", margin: "0 0 30px" }
const footer = { fontSize: "12px", color: "#8a8d94", margin: "32px 0 0", borderTop: "1px solid #ececec", paddingTop: "20px" }
