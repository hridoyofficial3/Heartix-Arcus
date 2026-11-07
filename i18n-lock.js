/* ============================================================
   i18n-lock.js — extra language keys for the PIN lock screen.
   Loaded right after i18n.js so `dict` already exists.
   ============================================================ */
(function(){
  if(typeof dict === 'undefined' || !dict || !dict.bn || !dict.en) return;

  /* ---- নতুন কী (PIN lock screen) ---- */
  Object.assign(dict.bn, {
    lockLoginLabel:"লগইন",
    lockEnterPin:"আপনার পিন দিন",
    lockSetPinDesc:"৪–৮ ডিজিটের একটা পিন বেছে নিন",
    lockConfirmPinDesc:"আবার একই পিন দিন",
    lockForgotPin:"পিন ভুলে গেছেন?",
    lockUsePassword:"পাসওয়ার্ড ব্যবহার করুন",
    lockErrPinWrong:"ভুল পিন",
    lockErrPinMismatch:"দুইবার পিন মিলল না",
    lockErrPasswordWrong:"ভুল পাসওয়ার্ড",
    lockErrFingerprint:"ফিঙ্গারপ্রিন্ট মেলেনি — পিন দিন",
    lockMigrateTitle:"পুরনো পাসওয়ার্ড দিন",
    lockMigrateDesc:"নিরাপত্তার জন্য এখন থেকে ৪–৮ ডিজিটের পিন ব্যবহার হবে। শেষবারের মতো পুরনো পাসওয়ার্ড দিয়ে ঢুকুন — এরপর নতুন পিন সেট করবেন।",
    lockPasswordDesc:"পুরনো পাসওয়ার্ড",
    lockPinSetDone:"পিন সেট হয়েছে",
    lockSqTitle:"নিরাপত্তা প্রশ্ন",
    a11yBackspace:"মুছুন", a11yConfirm:"নিশ্চিত করুন", a11yFingerprint:"ফিঙ্গারপ্রিন্ট"
  });

  Object.assign(dict.en, {
    lockLoginLabel:"LOGIN",
    lockEnterPin:"Enter Your PIN",
    lockSetPinDesc:"Choose a 4–8 digit PIN",
    lockConfirmPinDesc:"Enter the same PIN again",
    lockForgotPin:"Forgot Your PIN?",
    lockUsePassword:"USE PASSWORD",
    lockErrPinWrong:"Wrong PIN",
    lockErrPinMismatch:"PINs don't match",
    lockErrPasswordWrong:"Wrong password",
    lockErrFingerprint:"Fingerprint didn't match — use your PIN",
    lockMigrateTitle:"Enter Your Old Password",
    lockMigrateDesc:"For your security, a 4–8 digit PIN is now used. Enter your old password one last time — then you'll set a new PIN.",
    lockPasswordDesc:"Old password",
    lockPinSetDone:"PIN set",
    lockSqTitle:"Security question",
    a11yBackspace:"Backspace", a11yConfirm:"Confirm", a11yFingerprint:"Fingerprint"
  });

  /* ---- Defensive: পুরনো i18n.js-এ কী না থাকলে ফলব্যাক ---- */
  var fallback = {
    bn: {
      lockScreenTooManyTries:"অনেকবার ভুল হয়েছে — {s} সেকেন্ড পর আবার চেষ্টা করো।",
      forgotPwTitle:"পাসওয়ার্ড রিসেট করো",
      forgotPwAnswerPh:"উত্তর লেখো",
      forgotPwSubmitBtn:"যাচাই করো",
      forgotPwCancelBtn:"ফিরে যাও",
      forgotPwWrongErr:"উত্তর মিলছে না।",
      forgotPwNoQSetMsg:"কোনো সিকিউরিটি প্রশ্ন সেট করা নেই, তাই এখান থেকে রিসেট করা সম্ভব না।",
      storageSaveFailMsg:"সেভ হয়নি — এখনই ব্যাকআপ নাও",
      lockPwChangedToast:"পিন পরিবর্তন হয়েছে।",
      lockDisabledToast:"অ্যাপ লক বন্ধ হয়ে গেছে।",
      disableLockConfirmMsg:"সত্যিই অ্যাপ লক বন্ধ করবে? তাহলে পিন ছাড়াই যে কেউ অ্যাপ খুলতে পারবে।",
      fingerprintEnabledToast:"ফিঙ্গারপ্রিন্ট আনলক চালু হলো।",
      fingerprintDisabledToast:"ফিঙ্গারপ্রিন্ট আনলক বন্ধ হলো।",
      fingerprintEnableFailToast:"ফিঙ্গারপ্রিন্ট চালু করা যায়নি। আবার চেষ্টা করো।",
      securityQRequiredErr:"প্রশ্ন ও উত্তর দুটোই দিতে হবে।",
      securityQSavedToast:"সিকিউরিটি প্রশ্ন সেভ হয়েছে।"
    },
    en: {
      lockScreenTooManyTries:"Too many wrong tries — try again in {s}s.",
      forgotPwTitle:"Reset Password",
      forgotPwAnswerPh:"Write the answer",
      forgotPwSubmitBtn:"Verify",
      forgotPwCancelBtn:"Go Back",
      forgotPwWrongErr:"That answer doesn't match.",
      forgotPwNoQSetMsg:"No security question was set, so this can't be reset here.",
      storageSaveFailMsg:"Not saved — take a backup now",
      lockPwChangedToast:"PIN changed.",
      lockDisabledToast:"App Lock turned off.",
      disableLockConfirmMsg:"Really turn off App Lock? Anyone will be able to open the app without a PIN.",
      fingerprintEnabledToast:"Fingerprint unlock is on.",
      fingerprintDisabledToast:"Fingerprint unlock is off.",
      fingerprintEnableFailToast:"Couldn't turn on fingerprint unlock. Try again.",
      securityQRequiredErr:"Both a question and an answer are required.",
      securityQSavedToast:"Security question saved."
    }
  };
  ['bn','en'].forEach(function(l){
    Object.keys(fallback[l]).forEach(function(k){
      if(!dict[l][k]) dict[l][k] = fallback[l][k];
    });
  });
})();