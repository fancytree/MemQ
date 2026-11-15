\set ON_ERROR_STOP on
DO $$ BEGIN
  IF has_function_privilege('anon','public.update_subscription_status(uuid,boolean,timestamptz,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.update_subscription_status(uuid,boolean,timestamptz,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.update_subscription_status(uuid,boolean,timestamptz,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected subscription function privileges';
  END IF;
  IF has_column_privilege('authenticated','public.profiles','is_pro','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','subscription_plan','INSERT')
     OR has_column_privilege('anon','public.profiles','id','INSERT')
     OR NOT has_column_privilege('authenticated','public.profiles','id','INSERT') THEN
    RAISE EXCEPTION 'Unexpected profile column privileges';
  END IF;
END $$;
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
INSERT INTO public.profiles (id) VALUES ('11111111-1111-1111-1111-111111111111');
DO $$ BEGIN
  BEGIN
    UPDATE public.profiles SET is_pro = true WHERE id = auth.uid();
    RAISE EXCEPTION 'Self-service subscription update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.update_subscription_status(auth.uid(), true, NULL, 'yearly');
    RAISE EXCEPTION 'Untrusted function call unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET ROLE service_role;
SELECT public.update_subscription_status('11111111-1111-1111-1111-111111111111', true, NULL, 'yearly');
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='11111111-1111-1111-1111-111111111111' AND is_pro AND subscription_plan='yearly') THEN
    RAISE EXCEPTION 'Trusted server update failed';
  END IF;
END $$;
SELECT 'Subscription permissions passed' AS result;
