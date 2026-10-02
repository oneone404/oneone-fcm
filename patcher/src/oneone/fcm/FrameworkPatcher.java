package oneone.fcm;

import com.android.tools.smali.dexlib2.*;
import com.android.tools.smali.dexlib2.builder.*;
import com.android.tools.smali.dexlib2.builder.instruction.*;
import com.android.tools.smali.dexlib2.dexbacked.DexBackedDexFile;
import com.android.tools.smali.dexlib2.iface.*;
import com.android.tools.smali.dexlib2.immutable.*;
import com.android.tools.smali.dexlib2.immutable.reference.ImmutableMethodReference;
import com.android.tools.smali.dexlib2.writer.pool.DexPool;
import com.hyperos.fcm.patcher.common.AlignedJarRepacker;
import com.hyperos.fcm.patcher.common.DexUtils;
import com.hyperos.fcm.patcher.common.LinkageVerifier;
import java.io.File;
import java.nio.file.Files;
import java.util.*;

/** Deliberately narrow experimental profile: GMS -> selected-package freezer thaw. */
public final class FrameworkPatcher {
    private static final String TARGET = "Lcom/miui/server/greeze/GreezeManagerService;";
    private static final String AUTO_TARGET = "Lcom/android/server/am/BroadcastQueueModernStubImpl;";
    private static final String HOOK = "Lcom/android/server/am/OneOnePushPolicy;";
    private static final List<String> PARAMS = Arrays.asList("I", "Ljava/lang/String;", "I", "Ljava/lang/String;", "Ljava/lang/String;");
    public static void main(String[] args) throws Exception {
        if (args.length < 2) throw new IllegalArgumentException("inspect <stock> | patch <stock> <out> <tools.jar>");
        File input = new File(args[1]);
        if (args[0].equals("validate") && args.length == 3) { validate(input, new File(args[2])); return; }
        MultiDexContainer<? extends DexBackedDexFile> container = DexFileFactory.loadDexContainer(input, Opcodes.getDefault());
        if (args[0].equals("inspect")) {
            for (String entry : container.getDexEntryNames()) for (ClassDef type : container.getEntry(entry).getDexFile().getClasses()) {
                if (type.getType().equals("Lcom/android/server/am/BroadcastRecord;")) {
                    for (Field field : type.getFields()) if (Arrays.asList("callingUid", "callerPackage", "intent").contains(field.getName()))
                        System.out.println("BroadcastRecord field: " + field.getName() + " " + field.getType());
                }
                if (type.getType().equals(TARGET) || type.getType().contains("BroadcastQueueModernStubImpl")) {
                    for (Method method : type.getMethods()) if (method.getName().equals("isAllowBroadcast") || method.getName().equals("checkApplicationAutoStart")) {
                        System.out.println(type.getType() + " " + method.getName() + method.getParameterTypes() + method.getReturnType()
                                + " regs=" + (method.getImplementation() == null ? -1 : method.getImplementation().getRegisterCount()));
                        if (method.getName().equals("checkApplicationAutoStart") && method.getImplementation() != null) {
                            for (com.android.tools.smali.dexlib2.iface.instruction.Instruction ins : method.getImplementation().getInstructions()) {
                                String detail = ins instanceof com.android.tools.smali.dexlib2.iface.instruction.ReferenceInstruction
                                    ? ((com.android.tools.smali.dexlib2.iface.instruction.ReferenceInstruction) ins).getReference().toString() : "";
                                if (ins instanceof com.android.tools.smali.dexlib2.iface.instruction.OneRegisterInstruction)
                                    detail += " v" + ((com.android.tools.smali.dexlib2.iface.instruction.OneRegisterInstruction) ins).getRegisterA();
                                if (ins instanceof com.android.tools.smali.dexlib2.iface.instruction.NarrowLiteralInstruction)
                                    detail += " literal=" + ((com.android.tools.smali.dexlib2.iface.instruction.NarrowLiteralInstruction) ins).getNarrowLiteral();
                                System.out.println("  " + ins.getOpcode() + " " + detail);
                            }
                        }
                    }
                }
            }
            return;
        }
        if (!args[0].equals("patch") || args.length != 4) throw new IllegalArgumentException("Invalid patch arguments");
        File output = new File(args[2]);
        if (output.exists() || input.getCanonicalFile().equals(output.getCanonicalFile())) throw new IllegalArgumentException("Output must be a new staging file");
        File tools = new File(args[3]);
        List<ClassDef> hookClasses = DexUtils.findClassesByPrefix(tools, HOOK);
        if (hookClasses.isEmpty()) throw new IllegalStateException("Missing policy classes");
        Map<String, byte[]> replacements = new HashMap<String, byte[]>();
        int hooks = 0;
        int autoHooks = 0;
        int maxDex = 1;
        for (String entry : container.getDexEntryNames()) {
            if (entry.matches("classes[0-9]+\\.dex")) maxDex = Math.max(maxDex, Integer.parseInt(entry.substring(7, entry.length() - 4)));
            List<ClassDef> classes = new ArrayList<ClassDef>();
            boolean changed = false;
            for (ClassDef type : container.getEntry(entry).getDexFile().getClasses()) {
                if (type.getType().startsWith(HOOK.substring(0, HOOK.length() - 1))) throw new IllegalStateException("Input already patched");
                if (!type.getType().equals(TARGET) && !type.getType().equals(AUTO_TARGET)) { classes.add(type); continue; }
                List<Method> methods = new ArrayList<Method>();
                for (Method method : type.getMethods()) {
                    List<String> params = new ArrayList<String>();
                    for (CharSequence p : method.getParameterTypes()) params.add(p.toString());
                    if (type.getType().equals(AUTO_TARGET) && method.getName().equals("checkApplicationAutoStart")
                            && params.equals(Arrays.asList("Lcom/android/server/am/BroadcastQueue;", "Lcom/android/server/am/BroadcastRecord;", "Landroid/content/pm/ResolveInfo;"))
                            && method.getReturnType().equals("Z") && method.getImplementation() != null
                            && !AccessFlags.STATIC.isSet(method.getAccessFlags())) {
                        MutableMethodImplementation impl = new MutableMethodImplementation(method.getImplementation());
                        int total = impl.getRegisterCount();
                        int first = DexUtils.paramRegister(method, total, 1);
                        if (total - DexUtils.paramRegCount(method) < 1) throw new IllegalStateException("No safe autostart scratch register");
                        Label original = impl.newLabelForIndex(0);
                        impl.addInstruction(0, new BuilderInstruction3rc(Opcode.INVOKE_STATIC_RANGE, first, 2,
                                new ImmutableMethodReference(HOOK, "allowAutoStart", Arrays.asList("Ljava/lang/Object;", "Landroid/content/pm/ResolveInfo;"), "Z")));
                        impl.addInstruction(1, new BuilderInstruction11x(Opcode.MOVE_RESULT, 0));
                        impl.addInstruction(2, new BuilderInstruction21t(Opcode.IF_EQZ, 0, original));
                        impl.addInstruction(3, new BuilderInstruction11x(Opcode.RETURN, 0));
                        methods.add(new ImmutableMethod(method.getDefiningClass(), method.getName(), method.getParameters(), method.getReturnType(),
                                method.getAccessFlags(), method.getAnnotations(), method.getHiddenApiRestrictions(), impl));
                        autoHooks++; changed = true; continue;
                    }
                    if (!method.getName().equals("isAllowBroadcast") || !params.equals(PARAMS)
                            || !method.getReturnType().equals("Z") || method.getImplementation() == null
                            || AccessFlags.STATIC.isSet(method.getAccessFlags())) { methods.add(method); continue; }
                    MutableMethodImplementation impl = new MutableMethodImplementation(method.getImplementation());
                    int total = impl.getRegisterCount();
                    int first = DexUtils.paramRegister(method, total, 0);
                    // Only clobber a genuine scratch local; preserve this and every argument.
                    if (total - DexUtils.paramRegCount(method) < 1 || first < 1) throw new IllegalStateException("No safe scratch register");
                    Label original = impl.newLabelForIndex(0);
                    impl.addInstruction(0, new BuilderInstruction3rc(Opcode.INVOKE_STATIC_RANGE, first, 5,
                            new ImmutableMethodReference(HOOK, "allow", PARAMS, "Z")));
                    impl.addInstruction(1, new BuilderInstruction11x(Opcode.MOVE_RESULT, 0));
                    impl.addInstruction(2, new BuilderInstruction21t(Opcode.IF_EQZ, 0, original));
                    impl.addInstruction(3, new BuilderInstruction11x(Opcode.RETURN, 0));
                    methods.add(new ImmutableMethod(method.getDefiningClass(), method.getName(), method.getParameters(), method.getReturnType(),
                            method.getAccessFlags(), method.getAnnotations(), method.getHiddenApiRestrictions(), impl));
                    hooks++; changed = true;
                }
                classes.add(new ImmutableClassDef(type.getType(), type.getAccessFlags(), type.getSuperclass(), type.getInterfaces(),
                        type.getSourceFile(), type.getAnnotations(), type.getFields(), methods));
            }
            if (changed) replacements.put(entry, dex(classes, output.getParentFile()));
        }
        if (hooks != 1 || autoHooks != 1) throw new IllegalStateException("Expected two unique hooks, got " + hooks + "/" + autoHooks);
        // New DEX entry avoids filling a stock DEX's method table with helper classes.
        replacements.put("classes" + (maxDex + 1) + ".dex", dex(hookClasses, output.getParentFile()));
        AlignedJarRepacker.repackJar(input, replacements, output);
        if (!LinkageVerifier.verifyJarLinkage(output, HOOK.substring(0, HOOK.length() - 1))) {
            output.delete(); throw new IllegalStateException("Structural/linkage verification failed");
        }
        System.out.println("ONEONE_PATCH_OK=1");
    }
    private static byte[] dex(Collection<ClassDef> classes, File directory) throws Exception {
        final Set<ClassDef> set = new LinkedHashSet<ClassDef>(classes);
        File temp = File.createTempFile("oneone-dex-", ".dex", directory);
        try {
            DexPool.writeTo(temp.getAbsolutePath(), new DexFile() {
                public Set<? extends ClassDef> getClasses() { return set; }
                public Opcodes getOpcodes() { return Opcodes.getDefault(); }
            });
            return Files.readAllBytes(temp.toPath());
        } finally { temp.delete(); }
    }
    private static Map<String, ClassDef> classes(File jar) throws Exception {
        Map<String, ClassDef> result = new HashMap<String, ClassDef>();
        MultiDexContainer<? extends DexBackedDexFile> container = DexFileFactory.loadDexContainer(jar, Opcodes.getDefault());
        for (String entry : container.getDexEntryNames()) for (ClassDef type : container.getEntry(entry).getDexFile().getClasses())
            if (result.put(type.getType(), type) != null) throw new IllegalStateException("Duplicate class");
        return result;
    }
    private static String signature(Method method) { return method.getName() + method.getParameterTypes() + method.getReturnType(); }
    private static String instructions(Method method) {
        StringBuilder result = new StringBuilder();
        if (method.getImplementation() == null) return "abstract";
        result.append("registers=").append(method.getImplementation().getRegisterCount());
        for (com.android.tools.smali.dexlib2.iface.instruction.Instruction ins : method.getImplementation().getInstructions()) {
            result.append('|').append(ins.getOpcode());
            // Compare public semantic operands, never backing DEX indices/object identity.
            for (Class<?> api : Arrays.asList(
                    com.android.tools.smali.dexlib2.iface.instruction.OneRegisterInstruction.class,
                    com.android.tools.smali.dexlib2.iface.instruction.TwoRegisterInstruction.class,
                    com.android.tools.smali.dexlib2.iface.instruction.ThreeRegisterInstruction.class,
                    com.android.tools.smali.dexlib2.iface.instruction.FiveRegisterInstruction.class,
                    com.android.tools.smali.dexlib2.iface.instruction.RegisterRangeInstruction.class,
                    com.android.tools.smali.dexlib2.iface.instruction.OffsetInstruction.class,
                    com.android.tools.smali.dexlib2.iface.instruction.WideLiteralInstruction.class,
                    com.android.tools.smali.dexlib2.iface.instruction.ReferenceInstruction.class,
                    com.android.tools.smali.dexlib2.iface.instruction.DualReferenceInstruction.class)) {
                if (api.isInstance(ins)) for (java.lang.reflect.Method getter : api.getMethods()) {
                    if (getter.getParameterTypes().length == 0 && getter.getName().startsWith("get") && !getter.getName().equals("getOpcode") && !getter.getName().equals("getCodeUnits")) {
                        try { result.append(':').append(getter.getName()).append('=').append(getter.invoke(ins)); }
                        catch (Exception failure) { throw new IllegalStateException(failure); }
                    }
                }
            }
        }
        return result.toString();
    }
    private static void validate(File stock, File patched) throws Exception {
        Map<String, ClassDef> before = classes(stock), after = classes(patched);
        int changed = 0;
        for (ClassDef type : before.values()) {
            ClassDef replacement = after.remove(type.getType());
            if (replacement == null) throw new IllegalStateException("Missing stock class: " + type.getType());
            Map<String, Method> methods = new HashMap<String, Method>();
            for (Method method : replacement.getMethods()) methods.put(signature(method), method);
            for (Method original : type.getMethods()) {
                Method current = methods.remove(signature(original));
                if (current == null) throw new IllegalStateException("Missing stock method");
                boolean target = (type.getType().equals(TARGET) && original.getName().equals("isAllowBroadcast"))
                    || (type.getType().equals(AUTO_TARGET) && original.getName().equals("checkApplicationAutoStart"));
                if (target) {
                    List<com.android.tools.smali.dexlib2.iface.instruction.Instruction> leading = new ArrayList<com.android.tools.smali.dexlib2.iface.instruction.Instruction>();
                    for (com.android.tools.smali.dexlib2.iface.instruction.Instruction ins : current.getImplementation().getInstructions()) { leading.add(ins); if (leading.size() == 4) break; }
                    if (leading.get(0).getOpcode() != Opcode.INVOKE_STATIC_RANGE || leading.get(1).getOpcode() != Opcode.MOVE_RESULT
                            || leading.get(2).getOpcode() != Opcode.IF_EQZ || leading.get(3).getOpcode() != Opcode.RETURN
                            || ((com.android.tools.smali.dexlib2.iface.instruction.OffsetInstruction) leading.get(2)).getCodeOffset() != 3)
                        throw new IllegalStateException("Invalid stock-fallback branch");
                    changed++;
                } else if (!instructions(original).equals(instructions(current))) throw new IllegalStateException("Unexpected modified method: " + type.getType() + signature(original));
            }
            if (!methods.isEmpty()) throw new IllegalStateException("Unexpected stock-class method addition");
        }
        for (String type : after.keySet()) if (!type.startsWith(HOOK.substring(0, HOOK.length()-1))) throw new IllegalStateException("Unexpected helper class");
        if (changed != 2 || after.size() != 3) throw new IllegalStateException("Unexpected hook/helper count: " + changed + "/" + after.size());
        System.out.println("PASS: exactly two stock methods hooked; original fallback branches and all other method instructions preserved; three policy classes added");
    }
}
