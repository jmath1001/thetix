import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data: settings, error: settingsError } = await supabase
      .from("slake_center_settings")
      .select("*")
      .single();

    if (settingsError || !settings) throw new Error("Settings not found");

    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

    const { data: sessions, error } = await supabase
      .from("slake_sessions")
      .select(`
        id,
        session_date,
        time,
        slake_session_students (
          id,
          status,
          reminder_sent,
          confirmation_token,
          topic,
          slake_students (
            name,
            email,
            parent_email
          )
        )
      `)
      .eq("session_date", tomorrowStr);

    if (error) throw error;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GOOGLE_EMAIL,
        pass: process.env.GOOGLE_APP_PASSWORD,
      },
    });

    // No sessions at all — notify center and bail
    if (!sessions || sessions.length === 0) {
      if (settings.center_email) {
        await transporter.sendMail({
          from: `"${settings.center_name}" <${process.env.GOOGLE_EMAIL}>`,
          to: settings.center_email,
          subject: `Reminder Summary — No scheduled students for ${tomorrowStr}`,
          text: [
            `Hi,`,
            ``,
            `The automated reminder job ran for ${tomorrowStr} but found no scheduled students to notify.`,
            ``,
            `No reminder emails were sent.`,
            ``,
            `— ${settings.center_name} Automated Reminders`,
          ].join("\n"),
        });
      }
      return NextResponse.json({ sent: 0 });
    }

    let sent = 0;

    type SummaryEntry = {
      studentName: string;
      emailedTo: string;
      sessionDate: string;
      sessionTime: string;
    };
    const summaryEntries: SummaryEntry[] = [];

    for (const session of sessions) {
      for (const entry of session.slake_session_students as any[]) {
        if (entry.reminder_sent) continue;
        if (!entry.slake_students) continue;

        const student = entry.slake_students;
        const targetEmail = student.parent_email || student.email;
        if (!targetEmail) continue;

        let token = entry.confirmation_token;
        if (!token) {
          token = randomUUID();
          await supabase
            .from("slake_session_students")
            .update({ confirmation_token: token })
            .eq("id", entry.id);
        }

        const confirmLink = `${process.env.NEXT_PUBLIC_BASE_URL}/confirm?token=${token}`;

        const body = settings.reminder_body
          .replace("{{name}}", student.name)
          .replace("{{date}}", session.session_date)
          .replace("{{time}}", session.time)
          .replace("{{link}}", confirmLink);

        await transporter.sendMail({
          from: `"${settings.center_name}" <${process.env.GOOGLE_EMAIL}>`,
          to: targetEmail,
          subject: settings.reminder_subject,
          text: body,
        });

        await supabase
          .from("slake_session_students")
          .update({ reminder_sent: true })
          .eq("id", entry.id);

        summaryEntries.push({
          studentName: student.name,
          emailedTo: targetEmail,
          sessionDate: session.session_date,
          sessionTime: session.time,
        });

        sent++;
      }
    }

    // Send summary email to center
    if (settings.center_email) {
      if (sent === 0) {
        // Sessions exist but all reminders were already sent previously
        await transporter.sendMail({
          from: `"${settings.center_name}" <${process.env.GOOGLE_EMAIL}>`,
          to: settings.center_email,
          subject: `Reminder Summary — No scheduled students for ${tomorrowStr}`,
          text: [
            `Hi,`,
            ``,
            `The automated reminder job ran for ${tomorrowStr} but found no scheduled students to notify.`,
            ``,
            `No reminder emails were sent.`,
            ``,
            `— ${settings.center_name} Automated Reminders`,
          ].join("\n"),
        });
      } else {
        const rows = summaryEntries
          .map(
            (e) =>
              `  • ${e.studentName} (${e.emailedTo}) — ${e.sessionDate} at ${e.sessionTime}`
          )
          .join("\n");

        await transporter.sendMail({
          from: `"${settings.center_name}" <${process.env.GOOGLE_EMAIL}>`,
          to: settings.center_email,
          subject: `Reminder Summary — ${sent} email${sent !== 1 ? "s" : ""} sent for ${tomorrowStr}`,
          text: [
            `Hi,`,
            ``,
            `Here is a summary of the reminder emails sent on ${now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" })}:`,
            ``,
            rows,
            ``,
            `Total sent: ${sent}`,
            ``,
            `— ${settings.center_name} Automated Reminders`,
          ].join("\n"),
        });
      }
    }

    return NextResponse.json({ sent });
  } catch (err: any) {
    console.error("CRON ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}