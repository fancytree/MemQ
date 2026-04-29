# MemQ Product Workflow Diagrams

This document uses Mermaid diagrams to illustrate the complete workflow of the MemQ product.

---

## 1. User Registration and Login Flow

```mermaid
flowchart TD
    Start([User Opens App]) --> CheckAuth{Is User Logged In?}
    CheckAuth -->|Yes| Dashboard[Enter Main Dashboard]
    CheckAuth -->|No| LoginPage[Login Page]
    
    LoginPage --> LoginMethod{Choose Login Method}
    LoginMethod -->|Email Login| EmailLogin[Enter Email and Password]
    LoginMethod -->|Google Login| GoogleOAuth[Google OAuth Authentication]
    LoginMethod -->|Apple Login| AppleOAuth[Apple OAuth Authentication]
    LoginMethod -->|Sign Up| SignUp[Sign Up Page]
    
    EmailLogin --> ValidateEmail{Validate Email Format}
    ValidateEmail -->|Invalid| ShowError[Show Error Message]
    ValidateEmail -->|Valid| CheckEmailVerified{Is Email Verified?}
    CheckEmailVerified -->|No| ResendVerification[Send Verification Email]
    CheckEmailVerified -->|Yes| Authenticate[Supabase Authentication]
    
    GoogleOAuth --> OAuthCallback[OAuth Callback Handling]
    AppleOAuth --> OAuthCallback
    OAuthCallback --> Authenticate
    
    SignUp --> ValidateSignUp{Validate Input}
    ValidateSignUp -->|Invalid| ShowError
    ValidateSignUp -->|Valid| CreateAccount[Create Account]
    CreateAccount --> SendVerificationEmail[Send Verification Email]
    SendVerificationEmail --> WaitVerification[Wait for User Verification]
    
    Authenticate --> AuthSuccess{Auth Successful?}
    AuthSuccess -->|No| ShowError
    AuthSuccess -->|Yes| InitSubscription[Initialize Subscription Status]
    InitSubscription --> Dashboard
    
    ShowError --> LoginPage
    WaitVerification --> LoginPage
```

---

## 2. Create Lesson and Add Terms Flow

```mermaid
flowchart TD
    Start([User Clicks Create Lesson]) --> CreateLesson[Create Lesson Page]
    CreateLesson --> InputLessonInfo[Enter Lesson Name and Description]
    InputLessonInfo --> SaveLesson[Save Lesson]
    SaveLesson --> LessonCreated{Lesson Created Successfully?}
    LessonCreated -->|No| ShowError[Show Error]
    LessonCreated -->|Yes| AddTermsPage[Enter Add Terms Page]
    
    AddTermsPage --> ChooseMethod{Choose Add Method}
    
    ChooseMethod -->|Manual Input| ManualInput[Manual Input Tab]
    ManualInput --> InputTerm[Enter Term and Definition]
    InputTerm --> AddMore{Add More?}
    AddMore -->|Yes| InputTerm
    AddMore -->|No| SaveTerms[Save Terms]
    
    ChooseMethod -->|AI Topic| AITopicInput[Enter Topic]
    AITopicInput --> CheckPro{Is Pro User?}
    CheckPro -->|No| CheckLimit{Check Usage Count}
    CheckLimit -->|Exceeded| ShowPaywall[Show Subscription Page]
    CheckLimit -->|Not Exceeded| GenerateTerms[Call AI to Generate Terms]
    CheckPro -->|Yes| GenerateTerms
    GenerateTerms --> AIResult[Display Generated Terms]
    AIResult --> ReviewTerms{Review Terms}
    ReviewTerms -->|Edit| EditTerm[Edit Term]
    ReviewTerms -->|Confirm| SaveTerms
    EditTerm --> SaveTerms
    
    ChooseMethod -->|Upload PDF| SelectPDF[Select PDF File]
    SelectPDF --> CheckPro2{Is Pro User?}
    CheckPro2 -->|No| CheckLimit2{Check Usage Count}
    CheckLimit2 -->|Exceeded| ShowPaywall
    CheckLimit2 -->|Not Exceeded| UploadPDF[Upload PDF to Storage]
    CheckPro2 -->|Yes| UploadPDF
    UploadPDF --> MinerUParse[MinerU Parse PDF]
    MinerUParse --> PollStatus{Poll Parse Status}
    PollStatus -->|Processing| PollStatus
    PollStatus -->|Completed| ExtractText[Extract Text Content]
    PollStatus -->|Failed| ShowError
    ExtractText --> AIGenerateTerms[AI Extract Terms]
    AIGenerateTerms --> PDFResult[Display Extracted Terms]
    PDFResult --> ReviewTerms
    
    SaveTerms --> GenerateQuestions[Auto Generate Questions]
    GenerateQuestions --> Finish[Complete, Navigate to Lesson Details]
    
    ShowError --> AddTermsPage
    ShowPaywall --> AddTermsPage
```

---

## 3. Study Flow (SRS Spaced Repetition System)

```mermaid
flowchart TD
    Start([User Starts Study]) --> SelectMode{Select Study Mode}
    SelectMode -->|Today Mode| TodayMode[Get All Terms Due Today from All Lessons]
    SelectMode -->|Lesson Mode| LessonMode[Get All Terms from Specified Lesson]
    
    TodayMode --> FetchTerms[Fetch Terms List]
    LessonMode --> FetchTerms
    
    FetchTerms --> FetchProgress[Fetch User Study Progress]
    FetchProgress --> SRSFilter[SRS Algorithm Filter]
    
    SRSFilter --> CheckDue{Check Due Reviews}
    CheckDue -->|Has Due| AddDueReviews[Add to Due Reviews List]
    CheckDue -->|No Due| CheckNew{Check New Terms}
    
    CheckNew -->|Has New| AddNewItems[Add to New Items List]
    CheckNew -->|No New| AllCaughtUp[Show "All Caught Up" Page]
    
    AddDueReviews --> CombineLists[Combine Lists and Shuffle]
    AddNewItems --> CombineLists
    CombineLists --> LimitSize[Limit to 20 Questions]
    LimitSize --> LoadQuestions[Load Questions]
    
    LoadQuestions --> StudySession[Start Study Session]
    StudySession --> ShowQuestion[Display Question]
    ShowQuestion --> AnswerType{Question Type}
    
    AnswerType -->|Multiple Choice| MCQ[Display Options]
    AnswerType -->|True/False| TrueFalse[Display True/False]
    AnswerType -->|Fill in Blank| FillBlank[Display Input Field]
    
    MCQ --> SelectAnswer[User Selects Answer]
    TrueFalse --> SelectAnswer
    FillBlank --> InputAnswer[User Inputs Answer]
    InputAnswer --> SelectAnswer
    
    SelectAnswer --> CheckAnswer[Check Answer]
    CheckAnswer --> IsCorrect{Is Answer Correct?}
    
    IsCorrect -->|Yes| CorrectFeedback[Show Correct Feedback]
    IsCorrect -->|No| WrongFeedback[Show Wrong Feedback]
    
    CorrectFeedback --> UpdateProgress[Update Progress: Index + 1]
    WrongFeedback --> UpdateProgress2[Update Progress: Downgrade to Learning]
    
    UpdateProgress --> CalculateNextReview[Calculate Next Review Time]
    UpdateProgress2 --> SetImmediateReview[Set Immediate Review]
    
    CalculateNextReview --> SaveProgress[Save Progress to Database]
    SetImmediateReview --> SaveProgress
    
    SaveProgress --> AutoAdvance{Answered Correctly?}
    AutoAdvance -->|Yes| Wait1200ms[Wait 1.2 seconds]
    AutoAdvance -->|No| ShowContinue[Show Continue Button]
    
    Wait1200ms --> NextQuestion
    ShowContinue --> UserContinue[User Clicks Continue]
    UserContinue --> NextQuestion
    
    NextQuestion --> CheckMore{More Questions?}
    CheckMore -->|Yes| ShowQuestion
    CheckMore -->|No| ShowSummary[Show Study Summary]
    
    ShowSummary --> Finish[Return to Lesson List]
    AllCaughtUp --> ReviewAll{User Chooses Review All?}
    ReviewAll -->|Yes| ForceReview[Force Review All Questions]
    ReviewAll -->|No| Finish
    ForceReview --> LoadQuestions
```

---

## 4. PDF Processing Flow (Detailed)

```mermaid
flowchart TD
    Start([User Selects PDF File]) --> ValidateFile{Validate File}
    ValidateFile -->|Invalid| ShowError[Show Error]
    ValidateFile -->|Valid| ReadFile[Read File as Base64]
    
    ReadFile --> UploadStorage[Upload to Supabase Storage]
    UploadStorage --> GetPublicURL[Get Public URL]
    GetPublicURL --> CreateMinerUTask[Create MinerU Parse Task]
    
    CreateMinerUTask --> GetTaskID[Get Task ID]
    GetTaskID --> PollLoop[Start Polling Loop]
    
    PollLoop --> CheckStatus[Check Task Status]
    CheckStatus --> StatusType{Status Type}
    
    StatusType -->|pending/processing| Wait2s[Wait 2 seconds]
    Wait2s --> CheckStatus
    
    StatusType -->|succeed| ExtractResult{Result Format}
    ExtractResult -->|Direct Text| UseText[Use Text Content]
    ExtractResult -->|ZIP File| DownloadZIP[Download ZIP]
    
    DownloadZIP --> Unzip[Unzip ZIP]
    Unzip --> FindMD[Find .md or .txt File]
    FindMD --> ReadContent[Read File Content]
    ReadContent --> UseText
    
    StatusType -->|failed| ShowError
    
    UseText --> TruncateText{Text Length > 15000?}
    TruncateText -->|Yes| Truncate[Truncate to 15000 Characters]
    TruncateText -->|No| KeepText[Keep Original Text]
    Truncate --> KeepText
    
    KeepText --> CallAIGenerate[Call AI Generate Terms Function]
    CallAIGenerate --> ParseResponse[Parse AI Response]
    ParseResponse --> ExtractTerms[Extract Terms List]
    ExtractTerms --> DisplayTerms[Display on Interface]
    DisplayTerms --> UserReview[User Reviews and Edits]
    UserReview --> SaveTerms[Save Terms]
    
    ShowError --> End([End])
    SaveTerms --> End
```

---

## 5. AI Chat Assistant Flow

```mermaid
flowchart TD
    Start([User Opens AI Assistant]) --> SelectMode{Select Chat Mode}
    
    SelectMode -->|Practice Mode| PracticeMode[Practice Mode]
    SelectMode -->|Ask Mode| AskMode[Ask Mode]
    SelectMode -->|Vocab Lookup Mode| VocabMode[Vocabulary Lookup Mode]
    
    PracticeMode --> LoadContext[Load Lesson Context]
    AskMode --> LoadContext
    VocabMode --> LoadContext
    
    LoadContext --> UserInput[User Inputs Message]
    UserInput --> BuildPrompt[Build System Prompt]
    
    BuildPrompt --> CallOpenAI[Call OpenAI API]
    CallOpenAI --> ParseResponse[Parse Response]
    
    ParseResponse --> ExtractTerm{Term Extracted?}
    ExtractTerm -->|Yes| ClassifyTerm[Classify Term]
    ExtractTerm -->|No| ShowReply[Display AI Reply]
    
    ClassifyTerm --> MatchLesson{Match Existing Lesson?}
    MatchLesson -->|Yes| SuggestExisting[Suggest Save to Existing Lesson]
    MatchLesson -->|No| SuggestNew[Suggest Create New Lesson]
    
    SuggestExisting --> ShowReply
    SuggestNew --> ShowReply
    
    ShowReply --> ShowTermCard{Has Extracted Term?}
    ShowTermCard -->|Yes| DisplayTermCard[Display Term Card]
    ShowTermCard -->|No| WaitNext[Wait for Next Message]
    
    DisplayTermCard --> UserAction{User Action}
    UserAction -->|Save to Existing Lesson| SaveToExisting[Save to Specified Lesson]
    UserAction -->|Create New Lesson| CreateNewLesson[Create New Lesson and Save]
    UserAction -->|Save to Default| SaveToDefault[Save to Default Lesson]
    UserAction -->|Ignore| WaitNext
    
    SaveToExisting --> ConfirmSave[Confirm Save Success]
    CreateNewLesson --> ConfirmSave
    SaveToDefault --> ConfirmSave
    ConfirmSave --> WaitNext
    
    WaitNext --> UserInput
```

---

## 6. Subscription Purchase Flow

```mermaid
flowchart TD
    Start([User Triggers Subscription]) --> CheckAuth{Is User Logged In?}
    CheckAuth -->|No| ShowLogin[Prompt Login]
    CheckAuth -->|Yes| NavigatePaywall[Navigate to Unlock Page]
    
    ShowLogin --> LoginPage[Login Page]
    LoginPage --> NavigatePaywall
    
    NavigatePaywall --> ShowUnlockPage[Show Unlock Page]
    ShowUnlockPage --> ClickTrial[Click "Start Free Trial"]
    ClickTrial --> ShowPaywallModal[Show Paywall Modal]
    
    ShowPaywallModal --> LoadOfferings[Load RevenueCat Offerings]
    LoadOfferings --> DisplayPlans[Display Plan Options]
    
    DisplayPlans --> SelectPlan{Select Plan}
    SelectPlan -->|Yearly| YearlyPlan[Yearly Plan]
    SelectPlan -->|Monthly| MonthlyPlan[Monthly Plan]
    
    YearlyPlan --> ShowSavings[Display Savings Percentage]
    MonthlyPlan --> ShowSavings
    ShowSavings --> ClickSubscribe[Click "Try Free and Subscribe"]
    
    ClickSubscribe --> CheckAuth2{Verify Login Again}
    CheckAuth2 -->|No| ShowLogin
    CheckAuth2 -->|Yes| PurchasePackage[Call RevenueCat Purchase]
    
    PurchasePackage --> PurchaseResult{Purchase Result}
    PurchaseResult -->|Success| UpdateSubscription[Update Subscription Status]
    PurchaseResult -->|User Cancelled| SilentReturn[Silent Return]
    PurchaseResult -->|Failed| ShowError[Show Error Message]
    
    UpdateSubscription --> RefreshStatus[Refresh Subscription Status]
    RefreshStatus --> ShowSuccess[Show Success Message]
    ShowSuccess --> CloseModal[Close Paywall Modal]
    
    ShowError --> DisplayPlans
    SilentReturn --> DisplayPlans
    CloseModal --> Finish([Complete])
```

---

## 7. SRS Algorithm Detailed Flow (Update Study Progress)

```mermaid
flowchart TD
    Start([User Answers Question]) --> GetAnswer{Get Answer Result}
    GetAnswer -->|Correct| CorrectPath[Correct Path]
    GetAnswer -->|Wrong| WrongPath[Wrong Path]
    
    CorrectPath --> GetCurrentIndex[Get Current Index]
    GetCurrentIndex --> IncrementIndex[Index + 1]
    IncrementIndex --> CheckMax{Index > 5?}
    CheckMax -->|Yes| SetMax[Set to 5]
    CheckMax -->|No| KeepIndex[Keep New Index]
    SetMax --> KeepIndex
    
    KeepIndex --> GetInterval[Get Standard Interval by Index]
    GetInterval --> CheckDeadline{Lesson Has Deadline?}
    CheckDeadline -->|Yes| CalculateDeadline[Calculate Remaining Days]
    CheckDeadline -->|No| UseStandard[Use Standard Interval]
    
    CalculateDeadline --> CalculateStages[Calculate Remaining Stages]
    CalculateStages --> CalculateMaxInterval[Calculate Max Allowed Interval]
    CalculateMaxInterval --> CompareInterval{Compare Intervals}
    CompareInterval -->|Standard < Max| UseStandard
    CompareInterval -->|Standard >= Max| UseMax[Use Max Interval]
    
    UseStandard --> CalculateNextReview[Calculate Next Review Time]
    UseMax --> CalculateNextReview
    
    WrongPath --> ResetIndex[Reset Index to 1]
    ResetIndex --> SetImmediate[Set Immediate Review]
    SetImmediate --> SaveProgress
    
    CalculateNextReview --> SaveProgress[Save Progress to Database]
    
    SaveProgress --> UpdateStatus[Update Status Field]
    UpdateStatus --> UpdateNextReview[Update next_review_at]
    UpdateNextReview --> UpdateLastReview[Update last_reviewed_at]
    UpdateLastReview --> Finish([Complete])
    
    style CorrectPath fill:#d4edda
    style WrongPath fill:#f8d7da
    style Finish fill:#cfe2ff
```

---

## 8. Overall Application Architecture Flow

```mermaid
flowchart TB
    subgraph "User Layer"
        User[User]
    end
    
    subgraph "Frontend Application"
        Auth[Authentication Module]
        Lesson[Lesson Management]
        Study[Study Module]
        AI[AI Features]
        Subscription[Subscription Management]
    end
    
    subgraph "Backend Services"
        Supabase[Supabase]
        OpenAI[OpenAI API]
        MinerU[MinerU API]
        RevenueCat[RevenueCat]
    end
    
    subgraph "Data Storage"
        Database[(PostgreSQL)]
        Storage[(Supabase Storage)]
        LocalCache[(Local Cache)]
    end
    
    User --> Auth
    User --> Lesson
    User --> Study
    User --> AI
    User --> Subscription
    
    Auth --> Supabase
    Lesson --> Supabase
    Study --> Supabase
    AI --> Supabase
    Subscription --> RevenueCat
    
    Supabase --> Database
    Supabase --> Storage
    Supabase --> OpenAI
    Supabase --> MinerU
    
    Lesson --> LocalCache
    Study --> LocalCache
    
    style User fill:#e1f5ff
    style Supabase fill:#4ade80
    style OpenAI fill:#fbbf24
    style RevenueCat fill:#a78bfa
    style Database fill:#60a5fa
    style Storage fill:#60a5fa
    style LocalCache fill:#f472b6
```

---

## Diagram Descriptions

### Flowchart Type Descriptions

1. **User Registration and Login Flow**: Shows how users register, login, and verify email
2. **Create Lesson and Add Terms Flow**: Shows lesson creation and three ways to add terms
3. **Study Flow (SRS)**: Shows the study flow based on spaced repetition system
4. **PDF Processing Flow**: Detailed flow of PDF upload, parsing, and term extraction
5. **AI Chat Assistant Flow**: Shows the workflow of three AI chat modes
6. **Subscription Purchase Flow**: Shows the complete flow from triggering subscription to completing purchase
7. **SRS Algorithm Detailed Flow**: Shows the algorithm logic for updating study progress
8. **Overall Application Architecture Flow**: Shows the relationships between system modules

### Color Legend

- **Green**: Success/Correct Path
- **Red**: Error/Failure Path
- **Blue**: Data Storage/Services
- **Yellow**: AI Services
- **Purple**: Third-party Services

---

*Last Updated: 2025-01-15*
